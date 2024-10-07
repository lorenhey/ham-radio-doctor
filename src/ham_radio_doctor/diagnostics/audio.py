import numpy as np
import soundfile as sf
from scipy.signal import welch, find_peaks
from typing import Dict, Any, Tuple

def analyze_audio_file(filepath: str) -> Dict[str, Any]:
    """
    Analiza un archivo WAV y extrae métricas clave para el diagnóstico.
    """
    data, samplerate = sf.read(filepath)
    
    # Manejar estéreo (tomar promedio para análisis base o analizar por canal si es necesario)
    if data.ndim > 1:
        data = np.mean(data, axis=1)

    # 1. DC Offset
    dc_offset = float(np.mean(data))
    
    # 2. Peak & RMS Level
    peak = float(np.max(np.abs(data)))
    rms = float(np.sqrt(np.mean(data**2)))
    
    # Crest Factor
    crest_factor = peak / rms if rms > 0 else 0.0

    # 3. Clipping (Hard Clipping threshold aprox 0.99)
    clipping_threshold = 0.99
    clipped_samples = np.sum(np.abs(data) >= clipping_threshold)
    clipping_percent = float(clipped_samples / len(data)) * 100.0

    # 4. Hum Detection (50/60 Hz and harmonics)
    hum_50hz = _detect_hum(data, samplerate, base_freq=50.0)
    hum_60hz = _detect_hum(data, samplerate, base_freq=60.0)
    
    hum_detected = False
    dominant_hum = None
    if hum_50hz["prominence"] > hum_60hz["prominence"] and hum_50hz["prominence"] > 10.0:
        hum_detected = True
        dominant_hum = 50.0
    elif hum_60hz["prominence"] > 10.0:
        hum_detected = True
        dominant_hum = 60.0

    return {
        "samplerate": samplerate,
        "duration_sec": len(data) / samplerate,
        "dc_offset": dc_offset,
        "peak_level": peak,
        "rms_level": rms,
        "crest_factor": crest_factor,
        "clipping_percent": clipping_percent,
        "hum_detected": hum_detected,
        "dominant_hum_hz": dominant_hum,
    }

def _detect_hum(data: np.ndarray, fs: int, base_freq: float) -> Dict[str, float]:
    """
    Utiliza Welch PSD para detectar picos en la frecuencia base y armónicos.
    """
    f, Pxx = welch(data, fs, nperseg=fs*2) # 0.5 Hz resolution
    
    # Buscar pico cerca de base_freq
    idx_base = np.argmin(np.abs(f - base_freq))
    
    # Simple check for prominence around the base freq
    window = Pxx[max(0, idx_base-5):min(len(Pxx), idx_base+5)]
    background_noise = np.median(Pxx)
    peak_val = np.max(window)
    
    prominence_db = 10 * np.log10(peak_val / background_noise) if background_noise > 0 else 0
    
    return {
        "prominence": float(prominence_db)
    }
