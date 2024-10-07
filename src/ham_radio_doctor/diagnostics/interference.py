import numpy as np
from scipy.signal import welch, find_peaks
from typing import Dict, Any, Tuple

def differential_spectrum(baseline_data: np.ndarray, current_data: np.ndarray, fs: int) -> Dict[str, Any]:
    """
    Calcula la diferencia (A/B Lab) entre dos capturas de audio/baseband.
    """
    f_base, pxx_base = welch(baseline_data, fs, nperseg=fs*2)
    f_curr, pxx_curr = welch(current_data, fs, nperseg=fs*2)
    
    # Asegurar misma longitud
    min_len = min(len(pxx_base), len(pxx_curr))
    f = f_base[:min_len]
    
    # PSD en dB
    db_base = 10 * np.log10(pxx_base[:min_len] + 1e-12)
    db_curr = 10 * np.log10(pxx_curr[:min_len] + 1e-12)
    
    diff_db = db_curr - db_base
    
    # Detectar aumento general de ruido (Broadband noise)
    mean_increase = float(np.mean(diff_db))
    
    return {
        "frequencies": f.tolist(),
        "diff_db": diff_db.tolist(),
        "mean_increase_db": mean_increase
    }

def detect_comb(data: np.ndarray, fs: int) -> Dict[str, Any]:
    """
    Busca firmas de ruido conmutado (Comb spacing).
    """
    f, pxx = welch(data, fs, nperseg=fs)
    db = 10 * np.log10(pxx + 1e-12)
    
    # Encontrar picos
    peaks, properties = find_peaks(db, prominence=5, distance=5)
    
    if len(peaks) < 3:
        return {"comb_detected": False}
        
    peak_freqs = f[peaks]
    
    # Calcular espaciado entre picos adyacentes
    spacings = np.diff(peak_freqs)
    
    # Si la desviación estándar del espaciado es pequeña, es un "comb"
    std_spacing = np.std(spacings)
    mean_spacing = np.mean(spacings)
    
    # Tolerancia heurística
    is_comb = float(std_spacing) < (0.1 * float(mean_spacing)) and float(mean_spacing) > 0
    
    return {
        "comb_detected": is_comb,
        "spacing_hz": float(mean_spacing) if is_comb else None,
        "peak_count": len(peaks)
    }
