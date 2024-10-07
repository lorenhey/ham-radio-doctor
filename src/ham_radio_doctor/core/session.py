from enum import Enum
from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field
from ham_radio_doctor.core.station import StationSnapshot

class EvidenceLevel(str, Enum):
    OBSERVED = "OBSERVED"
    DERIVED = "DERIVED"
    INFERRED = "INFERRED"
    UNKNOWN = "UNKNOWN"

class SupportType(str, Enum):
    SUPPORTS = "SUPPORTS"
    CONTRADICTS = "CONTRADICTS"
    UNKNOWN = "UNKNOWN"

class Evidence(BaseModel):
    description: str
    level: EvidenceLevel
    value: Any = None
    units: Optional[str] = None

class Hypothesis(BaseModel):
    description: str
    supported_by: List[Evidence] = Field(default_factory=list)
    contradicted_by: List[Evidence] = Field(default_factory=list)
    unknowns: List[str] = Field(default_factory=list)

class Finding(BaseModel):
    title: str
    description: str
    severity: str = "INFO"
    evidence: List[Evidence] = Field(default_factory=list)

class DiagnosticSession(BaseModel):
    """
    Sesión de diagnóstico. Acumula mediciones, evidencia e hipótesis.
    """
    id: str
    symptom: Optional[str] = None
    current_station: Optional[StationSnapshot] = None
    known_good_station: Optional[StationSnapshot] = None
    evidence_pool: List[Evidence] = Field(default_factory=list)
    findings: List[Finding] = Field(default_factory=list)
    hypotheses: List[Hypothesis] = Field(default_factory=list)

    def add_evidence(self, ev: Evidence):
        self.evidence_pool.append(ev)

    def add_finding(self, finding: Finding):
        self.findings.append(finding)

    def add_hypothesis(self, hyp: Hypothesis):
        self.hypotheses.append(hyp)

    def analyze(self) -> Dict[str, Any]:
        """
        Ejecuta el motor de reglas (Rule Engine) sobre la evidencia recolectada.
        """
        # Aquí irá el motor de reglas basado en evidencias.
        return {
            "findings_count": len(self.findings),
            "hypotheses_count": len(self.hypotheses),
            "evidence_count": len(self.evidence_pool)
        }
