import skrf as rf
import numpy as np
from typing import Dict, Any, Tuple, Optional

def analyze_touchstone(filepath: str) -> Dict[str, Any]:
    """
    Analiza un archivo Touchstone (.s1p) usando scikit-rf.
    Extrae SWR, resonancia e impedancia.
    """
    try:
        network = rf.Network(filepath)
    except Exception as e:
        return {"error": f"Failed to parse Touchstone file: {str(e)}"}

    if network.nports != 1:
        return {"error": "Expected a 1-port network (.s1p)"}

    freqs_hz = network.f
    swr = network.s_vswr.flatten()
    
    # Encontrar resonancia (mínimo SWR)
    min_swr_idx = np.argmin(swr)
    res_freq_hz = freqs_hz[min_swr_idx]
    res_swr = swr[min_swr_idx]
    
    # Impedancia en resonancia
    z_res = network.z[min_swr_idx, 0, 0]
    
    # Calcular ancho de banda SWR <= 2.0 (si aplica)
    swr_threshold = 2.0
    valid_indices = np.where(swr <= swr_threshold)[0]
    
    bandwidth_hz = 0.0
    if len(valid_indices) > 0:
        # Aproximación simple asumiendo una única región contigua principal
        bw_min_f = freqs_hz[valid_indices[0]]
        bw_max_f = freqs_hz[valid_indices[-1]]
        bandwidth_hz = bw_max_f - bw_min_f

    return {
        "file": filepath,
        "f_start_hz": float(freqs_hz[0]),
        "f_stop_hz": float(freqs_hz[-1]),
        "points": len(freqs_hz),
        "resonance_hz": float(res_freq_hz),
        "resonance_swr": float(res_swr),
        "resonance_z_real": float(z_res.real),
        "resonance_z_imag": float(z_res.imag),
        "bandwidth_2_0_hz": float(bandwidth_hz) if bandwidth_hz > 0 else None
    }

def compare_antenna_baselines(baseline: Dict[str, Any], current: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compara dos análisis de antena para detectar corrimientos (Antenna Health Trend).
    """
    if "error" in baseline or "error" in current:
        return {"error": "Cannot compare invalid analyses"}

    res_shift_hz = current["resonance_hz"] - baseline["resonance_hz"]
    swr_change = current["resonance_swr"] - baseline["resonance_swr"]
    
    findings = []
    
    # Shift threshold (e.g., 50 kHz)
    if abs(res_shift_hz) > 50e3:
        findings.append(f"Resonance shifted by {res_shift_hz / 1e3:.1f} kHz.")
        
    if abs(swr_change) > 0.3:
        findings.append(f"Minimum SWR changed by {swr_change:+.2f}.")
        
    return {
        "resonance_shift_hz": res_shift_hz,
        "swr_change": swr_change,
        "findings": findings
    }
