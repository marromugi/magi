import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { FilesystemStorage } from "@magi/kv/providers/filesystem";
import { SQLiteDatabase } from "@magi/db/providers/sqlite";
import { DeviceStore } from "./device";

describe("DeviceStore", () => {
  let tempDir: string;
  let store: DeviceStore;
  let db: SQLiteDatabase;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "magi-auth-"));
    db = new SQLiteDatabase(join(tempDir, "test.db"));
    store = new DeviceStore({
      kv: new FilesystemStorage(join(tempDir, "kv")),
      devices: db.devices,
    });
  });

  afterEach(async () => {
    db.close();
    await rm(tempDir, { recursive: true });
  });

  describe("createInvite", () => {
    it("creates a pairing request with bootstrap token", async () => {
      const result = await store.createInvite({ ttlMs: 60_000 });
      expect(result.bootstrapToken).toMatch(/^[0-9a-f]{64}$/);
      expect(result.pairingId).toBeTruthy();

      const request = await store.getPairingRequest(result.pairingId);
      expect(request).not.toBeNull();
      expect(request!.used).toBe(false);
    });
  });

  describe("pair", () => {
    it("exchanges bootstrap token for device token", async () => {
      const invite = await store.createInvite({ ttlMs: 60_000 });
      const result = await store.pair({
        bootstrapToken: invite.bootstrapToken,
        deviceName: "test-device",
      });

      expect(result.deviceToken).toMatch(/^[0-9a-f]{64}$/);
      expect(result.deviceId).toBeTruthy();

      const device = await store.getDevice(result.deviceId);
      expect(device).not.toBeNull();
      expect(device!.name).toBe("test-device");
      expect(device!.status).toBe("paired");
    });

    it("rejects an invalid bootstrap token", async () => {
      expect(
        store.pair({
          bootstrapToken: "invalid-token",
          deviceName: "test",
        }),
      ).rejects.toThrow("Invalid or expired bootstrap token");
    });

    it("rejects an already used bootstrap token", async () => {
      const invite = await store.createInvite({ ttlMs: 60_000 });
      await store.pair({
        bootstrapToken: invite.bootstrapToken,
        deviceName: "device-1",
      });

      expect(
        store.pair({
          bootstrapToken: invite.bootstrapToken,
          deviceName: "device-2",
        }),
      ).rejects.toThrow("Invalid or expired bootstrap token");
    });

    it("rejects an expired bootstrap token", async () => {
      const invite = await store.createInvite({ ttlMs: 1 });
      await new Promise((r) => setTimeout(r, 10));

      expect(
        store.pair({
          bootstrapToken: invite.bootstrapToken,
          deviceName: "test",
        }),
      ).rejects.toThrow("Invalid or expired bootstrap token");
    });
  });

  describe("validateDeviceToken", () => {
    it("returns device for a valid token", async () => {
      const invite = await store.createInvite({ ttlMs: 60_000 });
      const { deviceToken, deviceId } = await store.pair({
        bootstrapToken: invite.bootstrapToken,
        deviceName: "my-device",
      });

      const device = await store.validateDeviceToken(deviceToken);
      expect(device).not.toBeNull();
      expect(device!.id).toBe(deviceId);
      expect(device!.name).toBe("my-device");
    });

    it("returns null for an invalid token", async () => {
      const device = await store.validateDeviceToken("bad-token");
      expect(device).toBeNull();
    });
  });

  describe("revokeDevice", () => {
    it("revokes a paired device", async () => {
      const invite = await store.createInvite({ ttlMs: 60_000 });
      const { deviceId, deviceToken } = await store.pair({
        bootstrapToken: invite.bootstrapToken,
        deviceName: "device",
      });

      await store.revokeDevice(deviceId);

      const device = await store.getDevice(deviceId);
      expect(device!.status).toBe("revoked");

      const validated = await store.validateDeviceToken(deviceToken);
      expect(validated).toBeNull();
    });
  });

  describe("listDevices", () => {
    it("returns all paired devices", async () => {
      const invite1 = await store.createInvite({ ttlMs: 60_000 });
      const invite2 = await store.createInvite({ ttlMs: 60_000 });
      await store.pair({
        bootstrapToken: invite1.bootstrapToken,
        deviceName: "device-1",
      });
      await store.pair({
        bootstrapToken: invite2.bootstrapToken,
        deviceName: "device-2",
      });

      const devices = await store.listDevices();
      expect(devices).toHaveLength(2);
      expect(devices.map((d) => d.name).sort()).toEqual([
        "device-1",
        "device-2",
      ]);
    });
  });
});
