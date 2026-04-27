export interface StorageProvider {
  readonly name: string;
  read(path: string): Promise<Buffer | null>;
  write(path: string, data: Buffer | string): Promise<void>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(prefix?: string): Promise<string[]>;
}
