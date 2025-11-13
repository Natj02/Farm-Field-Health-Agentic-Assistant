from fastapi import FastAPI
from pydantic import BaseModel
from typing import List

app = FastAPI()


class Field(BaseModel):
    field_id: str
    field_name: str
    location: str
    crop: str
    soil_moisture: float    # 0–100, ideal around ~60
    vigor_index: float      # 0–100, higher = healthier plants
    yield_history: float    # 0–100, higher = better historic yield
    pest_pressure: float    # 0–100, higher = worse


class FieldWithRisk(Field):
    risk_score: float
    risk_level: str


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def compute_risk(f: Field) -> FieldWithRisk:
    """
    Simple heuristic combining a few agronomic signals:

    - Soil moisture: ideal ≈ 60. Too dry or too wet => more risk.
    - Pest pressure: higher index => more risk.
    - Vigor index: below ≈ 70 => more risk.
    - Yield history: below ≈ 80 => more risk.
    """

    moisture_risk = clamp01(abs(f.soil_moisture - 60.0) / 60.0)
    pest_risk = clamp01(f.pest_pressure / 100.0)
    vigor_risk = clamp01(max(0.0, (70.0 - f.vigor_index) / 70.0))
    yield_risk = clamp01(max(0.0, (80.0 - f.yield_history) / 80.0))

    risk_score = round(
        0.30 * moisture_risk
        + 0.30 * pest_risk
        + 0.20 * vigor_risk
        + 0.20 * yield_risk,
        2,
    )

    if risk_score < 0.35:
        level = "Low"
    elif risk_score < 0.7:
        level = "Moderate"
    else:
        level = "High"

    return FieldWithRisk(
        **f.dict(),
        risk_score=risk_score,
        risk_level=level,
    )


@app.post("/score_fields", response_model=List[FieldWithRisk])
def score_fields(fields: List[Field]):
    return [compute_risk(f) for f in fields]

