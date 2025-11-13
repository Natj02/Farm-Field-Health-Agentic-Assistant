# 🧑‍🌾 Farm Agentic Stack – Setup Notes

This README summarizes how to set up and run:

- React (Vite) frontend  
- Docker  
- n8n + PostgreSQL  
- FastAPI backend  
- Ollama LLM runtime  
- Firewall & connectivity checks

---

## 1. Node.js / React (Vite)

### Install Node & npm

```bash
sudo dnf install -y nodejs npm
```

Check versions:

```bash
node -v
npm -v
```

### Run the dev server

```bash
npm run dev -- --host 0.0.0.0
```

### Open Vite port (5173)

```bash
sudo firewall-cmd --permanent --add-port=5173/tcp
sudo firewall-cmd --reload
```

---

## 2. Docker

### Remove any old Docker installation

```bash
sudo dnf remove -y docker   docker-client   docker-client-latest   docker-common   docker-latest   docker-latest-logrotate   docker-logrotate   docker-engine || true
```

### Install Docker CE

```bash
sudo dnf install -y yum-utils device-mapper-persistent-data lvm2
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io
```

Enable and check Docker:

```bash
sudo systemctl enable --now docker
systemctl status docker
```

---

## 3. n8n Configuration

### `.env` example

```env
POSTGRES_USER=n8n
POSTGRES_PASSWORD=supersecretpassword
POSTGRES_DB=n8n

GENERIC_TIMEZONE=Asia/Manila

N8N_HOST=192.168.100.122
N8N_PORT=5678
WEBHOOK_URL=http://192.168.100.122:5678/

N8N_ENCRYPTION_KEY=some-long-random-string-change-me

N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=change-me-please
```

### Open n8n port (5678)

```bash
sudo firewall-cmd --permanent --add-port=5678/tcp
sudo firewall-cmd --reload
sudo firewall-cmd --list-ports
```

---

## 4. FastAPI Backend (with venv)

### Install Python & venv

```bash
sudo dnf install -y python3 python3-venv
```

### Create virtual environment

```bash
python3 -m venv .venv
# (optional) source .venv/bin/activate
```

### Install dependencies

```bash
pip install fastapi uvicorn[standard]
```

### Run the API

```bash
uvicorn api:app --host 0.0.0.0 --port 8000
```

---

## 5. Firewall Ports to Allow

```bash
sudo firewall-cmd --permanent --add-port=5173/tcp  # React dev
sudo firewall-cmd --permanent --add-port=5678/tcp  # n8n
sudo firewall-cmd --permanent --add-port=8000/tcp  # FastAPI
sudo firewall-cmd --permanent --add-port=11434/tcp # Ollama
sudo firewall-cmd --reload
```

---

## 6. Quick Connectivity Checks

### Inside n8n container

```bash
sudo docker exec -it n8n-n8n-1 sh
cat /etc/os-release
```

Install `curl` if needed:

**Debian/Ubuntu container:**

```bash
apt-get update && apt-get install -y curl
```

**Alpine container:**

```bash
apk add --no-cache curl
```

### Test FastAPI

```bash
curl -X POST   -H 'Content-Type: application/json'   -d '[]'   http://host.docker.internal:8000/score_fields
```

### Test Ollama (from container)

```bash
curl -X POST   -H 'Content-Type: application/json'   -d '{"model":"llama3.2:latest","prompt":"test","stream":false}'   http://host.docker.internal:11434/api/generate
```

---

## 7. Ollama Installation & Usage

### Install Ollama

```bash
sudo dnf install -y curl
curl -fsSL https://ollama.com/install.sh | sh
```

Run Ollama:

```bash
ollama serve
sudo systemctl enable --now ollama
```

### Models

```bash
ollama pull llama3.2
ollama list
```

### Quick local test

```bash
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.2",
  "prompt": "Say hi in one short sentence.",
  "stream": false
}'
```

---

## 8. Ollama Debugging

Check if Ollama is listening:

```bash
sudo ss -tnlp | grep 11434
```

You want:

```text
0.0.0.0:11434
```

If not, restart Ollama with explicit host:

```bash
sudo systemctl stop ollama

# Run Ollama manually with host binding
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

Then re-enable the service:

```bash
sudo systemctl enable --now ollama
sudo systemctl status ollama
```
