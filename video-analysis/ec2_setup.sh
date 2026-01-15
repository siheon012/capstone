#!/bin/bash
# EC2 setup helper (Ubuntu 22.04) - install Docker, NVIDIA drivers, nvidia-docker2
# Run as root or sudo
set -e

# Update
apt-get update && apt-get install -y build-essential curl apt-transport-https ca-certificates gnupg lsb-release

# Install Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io

# Install NVIDIA driver (recommended to use vendor AMI with driver preinstalled)
# Minimal install: add NVIDIA package repo and install driver
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
# add CUDA repo key and repo (CUDA 11.8 example)
curl -fsSL https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/3bf863cc.pub | gpg --dearmor -o /usr/share/keyrings/nvidia-cuda-keyring.gpg

# Install NVIDIA Container Toolkit
distribution=ubuntu22.04
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-docker-keyring.gpg
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sed 's#https://#deb [signed-by=/usr/share/keyrings/nvidia-docker-keyring.gpg] https://#g' > /etc/apt/sources.list.d/nvidia-docker.list
apt-get update && apt-get install -y nvidia-docker2
systemctl restart docker

# Add ubuntu user to docker group (adjust username as needed)
USERNAME=${SUDO_USER:-ubuntu}
usermod -aG docker $USERNAME

echo "EC2 setup completed. Reboot recommended."
