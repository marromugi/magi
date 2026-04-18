#!/bin/bash
set -euo pipefail
IFS=$'\n\t'

# ============================================================
# magi-sandbox firewall
# 許可リスト以外への外部通信をブロックする
# ============================================================

echo "[firewall] Configuring network restrictions..."

# --- Docker DNS ルールを退避 ---
DOCKER_DNS_RULES=$(iptables-save -t nat | grep "127\.0\.0\.11" || true)

# --- 既存ルールをフラッシュ ---
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

# --- Docker DNS ルールを復元 ---
if [ -n "$DOCKER_DNS_RULES" ]; then
    iptables -t nat -N DOCKER_OUTPUT 2>/dev/null || true
    iptables -t nat -N DOCKER_POSTROUTING 2>/dev/null || true
    echo "$DOCKER_DNS_RULES" | xargs -L 1 iptables -t nat
fi

# --- 基本ルール: DNS / SSH / localhost ---
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT -p udp --sport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# --- 許可ドメインの IP セットを作成 ---
ipset create allowed-domains hash:net

# GitHub IP ranges
echo "[firewall] Fetching GitHub IP ranges..."
gh_ranges=$(curl -s https://api.github.com/meta)
if [ -n "$gh_ranges" ] && echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null 2>&1; then
    while read -r cidr; do
        ipset add allowed-domains "$cidr" 2>/dev/null || true
    done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | aggregate -q)
else
    echo "[firewall] WARNING: Failed to fetch GitHub IP ranges"
fi

# 許可ドメイン
for domain in \
    "registry.npmjs.org" \
    "api.anthropic.com" \
    "sentry.io" \
    "statsig.anthropic.com" \
    "statsig.com"; do
    ips=$(dig +noall +answer A "$domain" | awk '$4 == "A" {print $5}')
    while read -r ip; do
        [ -n "$ip" ] && ipset add allowed-domains "$ip" 2>/dev/null || true
    done < <(echo "$ips")
done

# --- ホストネットワークを許可 ---
HOST_IP=$(ip route | grep default | cut -d" " -f3)
HOST_NETWORK=$(echo "$HOST_IP" | sed "s/\.[0-9]*$/.0\/24/")
iptables -A INPUT -s "$HOST_NETWORK" -j ACCEPT
iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT

# --- デフォルトポリシー: DROP ---
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# 確立済み接続を許可
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# 許可ドメインへの送信のみ許可
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

# それ以外は即座に拒否
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited

# --- 検証 ---
echo "[firewall] Verifying..."
if curl --connect-timeout 3 -s https://example.com >/dev/null 2>&1; then
    echo "[firewall] ERROR: Verification failed - example.com is reachable"
    exit 1
fi
echo "[firewall] OK - network restricted to allowed domains only"
