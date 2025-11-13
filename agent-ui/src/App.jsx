import React, { useState } from "react";
import Papa from "papaparse";

const N8N_WEBHOOK_URL =
  import.meta.env.VITE_WEBHOOK_URL ||
  "http://localhost:5678/webhook/field-analysis"; // fallback for dev

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function App() {
  const [file, setFile] = useState(null);
  const [fields, setFields] = useState([]);
  const [results, setResults] = useState([]); // analysed fields coming back from n8n
  const [selectedFieldId, setSelectedFieldId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Parse CSV on the client
  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    setError("");
    setResults([]);
    setSelectedFieldId("");

    if (!f) {
      setFile(null);
      setFields([]);
      return;
    }

    setFile(f);

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        // Normalise column names (trim + lower)
        const rows = res.data.map((row, idx) => {
          const norm = {};
          Object.keys(row).forEach((k) => {
            const key = k.trim().toLowerCase();
            norm[key] = row[k];
          });

          return {
            field_id: norm.field_id || String(idx + 1),
            field_name: norm.field_name || "",
            location: norm.location || "",
            crop: norm.crop || "",
            soil_moisture:
              norm["soil moisture (%)"] ?? norm.soil_moisture ?? "",
            vigor_index: norm["vigor index"] ?? norm.vigor_index ?? "",
            yield_history: norm["yield history"] ?? norm.yield_history ?? "",
            pest_pressure:
              norm["pest / disease pressure"] ??
              norm.pest_pressure ??
              norm.disease_pressure ??
              "",
          };
        });

        setFields(rows);
      },
      error: (err) => {
        console.error(err);
        setError("Failed to parse CSV. Please check the file format.");
        setFields([]);
      },
    });
  };

  const handleRunAnalysis = async () => {
    setError("");
    setResults([]);
    setSelectedFieldId("");

    if (!file) {
      setError("Please choose a CSV file first.");
      return;
    }
    if (!fields.length) {
      setError("No rows found in the CSV. Please check the file.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(fields),
      });

      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || `Request failed with status ${res.status}`);
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(text || "Server returned data that is not valid JSON.");
      }

      // Support either:
      //  - an array of field objects
      //  - or { fields: [...] }
      let analysed;
      if (Array.isArray(data)) {
        analysed = data;
      } else if (data && Array.isArray(data.fields)) {
        analysed = data.fields;
      } else {
        console.error("Unexpected response shape from server:", data);
        throw new Error("Server returned an unexpected response shape.");
      }

      setResults(analysed);
      if (analysed[0]?.field_id != null) {
        setSelectedFieldId(String(analysed[0].field_id));
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Something went wrong while running analysis.");
    } finally {
      setLoading(false);
    }
  };

  const hasResults = Array.isArray(results) && results.length > 0;

  const riskSummary = hasResults
    ? results.map((r) => ({
        field_id: r.field_id,
        field_name: r.field_name,
        crop: r.crop,
        risk_level: r.risk_level,
        risk_score: r.risk_score,
      }))
    : [];

  const selectedField =
    hasResults &&
    results.find(
      (r) => String(r.field_id) === String(selectedFieldId || "")
    );

  // Pick the best available recommendation text field
  const selectedRecommendationText =
    (selectedField &&
      (selectedField.advice ||
        selectedField.ai_message ||
        selectedField.feedback ||
        selectedField.response)) ||
    "";

  return (
    <div className="app-shell">
      <div className="app-inner">
        {/* Header */}
        <header className="app-header">
          <div className="app-title-row">
            <div className="app-logo">
              <span className="logo-icon">🌾</span>
            </div>
            <div>
              <h1>Farm Field Health Agentic Assistant</h1>
              <p>
                Upload a CSV with field observations. The system will analyse
                field risk and generate AI-based agronomic guidance via n8n +
                FastAPI + Ollama.
              </p>
            </div>
          </div>
        </header>

        {/* Upload card */}
        <section className="card upload-card">
          <h2>Upload CSV</h2>
          <p className="card-subtitle">
            The CSV should contain one row per field (or plot), including basic
            metrics like soil moisture, vegetation indices, yield history, and
            pest or disease pressure.
          </p>

          <div className="upload-controls">
            <label className="file-button">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
              />
              {file ? "Change CSV" : "Choose CSV"}
            </label>
            <span className="file-name">
              {file ? file.name : "No file selected"}
            </span>
            <button
              className="primary-button"
              onClick={handleRunAnalysis}
              disabled={loading || !file}
            >
              {loading ? "Running analysis…" : "Run Analysis"}
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}
        </section>

        {/* Preview card */}
        <section className="card">
          <div className="card-header-row">
            <h2>Preview of uploaded data</h2>
            <span className="badge">
              {fields.length ? `${fields.length} fields` : "No data yet"}
            </span>
          </div>

          {fields.length === 0 ? (
            <p className="card-placeholder">
              Upload a CSV and run the analysis to see your field data.
            </p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Field ID</th>
                    <th>Field name</th>
                    <th>Location</th>
                    <th>Crop</th>
                    <th>Soil moisture (%)</th>
                    <th>Vigor index</th>
                    <th>Yield history</th>
                    <th>Pest / disease pressure</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f, idx) => (
                    <tr key={idx}>
                      <td>{f.field_id}</td>
                      <td>{f.field_name}</td>
                      <td>{f.location}</td>
                      <td>{f.crop}</td>
                      <td>{f.soil_moisture}</td>
                      <td>{f.vigor_index}</td>
                      <td>{f.yield_history}</td>
                      <td>{f.pest_pressure}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Only show results after a successful analysis */}
        {hasResults && (
          <>
            {/* Risk summary */}
            <section className="card">
              <div className="card-header-row">
                <h2>Risk summary</h2>
                <span className="badge">
                  {riskSummary.length
                    ? `${riskSummary.length} analysed`
                    : "Waiting for data"}
                </span>
              </div>

              {riskSummary.length === 0 ? (
                <p className="card-placeholder">
                  Once analysis finishes, each field will get a risk level and
                  score here.
                </p>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Crop</th>
                        <th>Risk level</th>
                        <th>Risk score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {riskSummary.map((r) => (
                        <tr key={r.field_id}>
                          <td>{r.field_name}</td>
                          <td>{r.crop}</td>
                          <td>{r.risk_level}</td>
                          <td>{r.risk_score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Detailed recommendations */}
            <section className="card">
              <h2>Detailed recommendations</h2>
              <p className="card-subtitle">
                Choose a field to view the AI-generated agronomic advice,
                tailored to its current condition and risk profile.
              </p>

              <div className="field-select-row">
                <select
                  value={selectedFieldId}
                  onChange={(e) => setSelectedFieldId(e.target.value)}
                >
                  {riskSummary.map((r) => (
                    <option key={r.field_id} value={r.field_id}>
                      {r.field_name} ({r.crop})
                    </option>
                  ))}
                </select>
              </div>

              <div className="recommendation-box">
                {selectedField ? (
                  <>
                    <p className="recommendation-meta">
                      <strong>
                        {selectedField.field_name} – {selectedField.crop}
                      </strong>{" "}
                      (Risk:{" "}
                      <span className="pill">
                        {selectedField.risk_level} – score{" "}
                        {selectedField.risk_score}
                      </span>
                      )
                    </p>
                    <p
                      className="recommendation-text"
                      style={{ whiteSpace: "pre-line", lineHeight: 1.6 }}
                    >
                      {selectedRecommendationText ||
                        "No recommendation text returned from the model."}
                    </p>
                  </>
                ) : (
                  <p className="card-placeholder">
                    Select a field above to see its detailed recommendation.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
