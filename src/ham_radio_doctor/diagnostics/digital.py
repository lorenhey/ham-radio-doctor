from typing import Dict, Any, List
import numpy as np

def analyze_wsjtx_timing(dt_values: List[float]) -> Dict[str, Any]:
    """
    Analiza la distribución del timing de decodificaciones de WSJT-X (DT).
    Un desplazamiento sistemático en DT puede indicar un problema del reloj de la PC.
    """
    if not dt_values:
        return {"error": "No DT values provided"}
        
    mean_dt = float(np.mean(dt_values))
    std_dt = float(np.std(dt_values))
    
    findings = []
    
    # Heurística: si el promedio está muy desplazado (ej > 1.0s para FT8) y la varianza es baja
    if abs(mean_dt) > 1.0 and std_dt < 0.5:
        findings.append(f"Systematic DT shift detected: {mean_dt:+.2f}s. PC clock may be out of sync.")
    elif abs(mean_dt) > 1.5:
        findings.append(f"High absolute mean DT: {mean_dt:+.2f}s. Timing issues likely.")
        
    return {
        "mean_dt": mean_dt,
        "std_dt": std_dt,
        "count": len(dt_values),
        "findings": findings
    }

def calculate_ppm_error(measured_f: float, reference_f: float) -> float:
    """
    Calcula el error de frecuencia en PPM.
    Delta f_ppm = 10^6 * (f_m - f_r) / f_r
    """
    if reference_f <= 0:
        raise ValueError("Reference frequency must be > 0")
    return 1e6 * (measured_f - reference_f) / reference_f
