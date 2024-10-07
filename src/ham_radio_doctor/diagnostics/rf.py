import math
from typing import Dict, Any, Optional

def calculate_swr(pf: float, pr: float) -> Optional[float]:
    """
    Calcula SWR dados potencia directa (Pf) y reflejada (Pr).
    Retorna None si la medición es inválida (Pf <= 0 o Pr > Pf).
    """
    if pf <= 0:
        return None
    if pr > pf:
        return None # Inválido
    if pr < 0:
        pr = 0.0
        
    gamma_mag = math.sqrt(pr / pf)
    if gamma_mag == 1.0:
        return float('inf')
        
    swr = (1 + gamma_mag) / (1 - gamma_mag)
    return swr

def calculate_return_loss(pf: float, pr: float) -> Optional[float]:
    """
    RL = -20 * log10(|Gamma|) = -10 * log10(Pr/Pf)
    """
    if pf <= 0 or pr > pf or pr <= 0:
        return None
    return -10.0 * math.log10(pr / pf)

def calculate_mismatch_loss(pf: float, pr: float) -> Optional[float]:
    """
    Lm = -10 * log10(1 - |Gamma|^2) = -10 * log10(1 - Pr/Pf)
    """
    if pf <= 0 or pr >= pf:
        return None
    return -10.0 * math.log10(1.0 - (pr / pf))

def analyze_power_readings(requested_w: float, reported_pf: float, external_pf: Optional[float] = None) -> Dict[str, Any]:
    """
    Compara potencia solicitada vs reportada vs externa (si existe).
    """
    findings = []
    
    # Rig meter discrepancy
    if reported_pf < requested_w * 0.5:
        findings.append("Rig reports significantly less forward power than requested.")
        
    if external_pf is not None:
        discrepancy = abs(reported_pf - external_pf)
        if discrepancy > requested_w * 0.2:
            findings.append("Significant discrepancy between Rig meter and External meter.")
            
    return {
        "requested": requested_w,
        "reported": reported_pf,
        "external": external_pf,
        "findings": findings
    }
