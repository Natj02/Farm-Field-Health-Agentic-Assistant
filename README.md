# 🧑‍🌾 Farm Agentic Stack – Setup Notes

This README summarizes how to set up and run:

- React (Vite) frontend  
- Docker  
- n8n + PostgreSQL  
- FastAPI backend  
- Ollama LLM runtime  
- Firewall & connectivity checks

---
## Environment Specs

The development VM used for this setup had the following configuration:

- **OS:** AlmaLinux 10 (Minimal)
- **Virtualization:** VirtualBox
- **Base Memory:** 8000 MB
- **Processors:** 4
- **Video Memory:** 16 MB (VMSVGA)
- **Storage:** 70 GB VDI (SATA)
- **Network Adapter:** Intel PRO/1000 MT Desktop (Bridged Adapter)
- **Audio:** ICH AC97
- **USB Controller:** OHCI/EHCI

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

---
# Node-by-Node Explanation of Your n8n Pipeline
Below is a breakdown of what each node does and why it's needed in the workflow.

The n8n workflow sits between the React UI, the FastAPI scoring service, and Ollama.
It does three main things:

1. Accepts the uploaded field data from the frontend.
2. Calls the FastAPI service to compute risk scores.
3. Calls Ollama to generate agronomic recommendations per field.
4. Returns the enriched results back to the frontend.

### Node-by-node breakdown

1. **Webhook**
   - Entry point for the React app.
   - Receives a JSON array of field objects (one per CSV row) via `POST`.
   - Hands this array to the next node for processing.

2. **Code in JavaScript**
   - Normalizes the incoming payload from the webhook.
   - Ensures we have one n8n item per field (so later nodes can run “for each item”).
   - Essentially: “fan-out” the array of fields into separate n8n items.

3. **HTTP Request** (FastAPI `/score_fields`)
   - Sends the list of fields to the FastAPI service:
     - `POST http://host.docker.internal:8000/score_fields`
   - FastAPI returns the same fields but with two extra properties:
     - `risk_score` – numeric risk (0–1).
     - `risk_level` – `"Low"`, `"Moderate"`, or `"High"`.
   - n8n now has one item per field including risk information.

4. **Code in JavaScript1** – *Build agronomy prompt*
   - Runs once per field.
   - Reads the field data (including `risk_score` and `risk_level`).
   - Builds a detailed natural-language prompt for the LLM, e.g.:
     - Explains the current risk level.
     - Asks for a short 4–6 sentence advisory note.
     - Includes the full field JSON inline for context.
   - Adds a new property:
     - `prompt` – the final text prompt to send to Ollama.

5. **Code in JavaScript2** – *Prepare Ollama payload*
   - Runs once per field.
   - Wraps the prompt in the JSON format that Ollama expects:
     ```json
     {
       "model": "llama3.2",
       "prompt": "<prompt text>",
       "stream": false
     }
     ```
   - Attaches this object as:
     - `ollama_payload` – used by the next HTTP Request.

6. **HTTP Request1** (Ollama `api/generate`)
   - Runs once per field.
   - Sends the `ollama_payload` to Ollama:
     - `POST http://host.docker.internal:11434/api/generate`
     - `Content-Type: application/json`
     - Body: `JSON.stringify($json.ollama_payload)`
   - Response format is set to **JSON**, so n8n parses the model’s output.
   - Each item now contains Ollama’s response (`response`, `message`, or `output`
     depending on model / version).

7. **Code in JavaScript3** – *Merge model advice back onto field*
   - Runs once per field.
   - Takes the HTTP response from Ollama and extracts the actual advice text:
     - Tries `response`, then `message`, then `output` as fallbacks.
   - Looks up the original field item from **Code in JavaScript2** so we still
     have all field + risk data.
   - Returns a merged object:
     - All original field properties (`field_id`, `crop`, `risk_score`, `risk_level`, …).
     - `advice` – the cleaned model output text used by the React UI.
     - Optionally `ollama_raw` – the full raw response (handy for debugging).

8. **Respond to Webhook**
   - Final node in the workflow.
   - Set to **Respond With: All Incoming Items**.
   - Returns an array of enriched field objects to the React app:
     ```json
     [
       {
         "field_id": "1",
         "field_name": "North Ridge 1",
         "crop": "Maize",
         "risk_score": 0.19,
         "risk_level": "Low",
         "advice": "…LLM-generated agronomic note…"
       },
     ]
     ```
   - The frontend then renders:
     - The **Risk summary** table from `risk_level` / `risk_score`.
     - The **Detailed recommendations** panel from `advice`.

---

| Order | Node name             | Type           | What it basically does                                                                 |
|------:|-----------------------|----------------|-----------------------------------------------------------------------------------------|
| 1     | Webhook               | Trigger        | Receives the JSON array of fields from the React app.                                  |
| 2     | Code in JavaScript    | Code           | Splits the incoming array into one n8n item per field (prepares data for processing).  |
| 3     | HTTP Request          | HTTP           | Calls FastAPI `/score_fields` to add `risk_score` and `risk_level` for each field.     |
| 4     | Code in JavaScript1   | Code           | Builds a detailed agronomy **prompt** string for the LLM using the field + risk data.  |
| 5     | Code in JavaScript2   | Code           | Wraps the prompt into an `ollama_payload` JSON body expected by Ollama.                |
| 6     | HTTP Request1         | HTTP           | Sends `ollama_payload` to Ollama `/api/generate` and gets the model’s response.        |
| 7     | Code in JavaScript3   | Code           | Merges Ollama’s text into the field as `advice` (keeping all field + risk fields).     |
| 8     | Respond to Webhook    | Response       | Returns the final list of enriched fields (with `risk_*` + `advice`) back to the UI.   |

