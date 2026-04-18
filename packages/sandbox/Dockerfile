FROM node:20

ARG TZ=Asia/Tokyo
ENV TZ="$TZ"

# System dependencies (including firewall tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    unzip \
    ca-certificates \
    sudo \
    iptables \
    ipset \
    iproute2 \
    dnsutils \
    aggregate \
    jq \
    gh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -s /bin/bash sandbox

# Install Bun globally
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Prepare workspace
RUN mkdir -p /workspace && chown sandbox:sandbox /workspace

# Firewall script (sandbox user can run it via sudo without password)
COPY init-firewall.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/init-firewall.sh && \
    echo "sandbox ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/sandbox-firewall && \
    chmod 0440 /etc/sudoers.d/sandbox-firewall

# Entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Run as non-root user
USER sandbox
WORKDIR /workspace

ENTRYPOINT ["/entrypoint.sh"]
