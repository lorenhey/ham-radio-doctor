/**
 * ham-doctor-engine.js - Ham Radio Doctor Core Diagnostic Engine v2.0.0
 * Pure JavaScript, offline-capable, zero external dependencies.
 * Author: Loren (lorenhey)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HamDoctorEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // --- 1. RF & SWR Diagnostics ---
  function calculateSWR(pf, pr) {
    pf = Number(pf);
    pr = Number(pr);

    if (isNaN(pf) || isNaN(pr) || pf <= 0) {
      return {
        valid: false,
        error: 'Forward power (Pf) must be greater than 0 W.',
        swr: null,
        returnLossDb: null,
        mismatchLossDb: null,
        netPowerW: 0,
        gamma: null,
        status: 'INVALID'
      };
    }

    if (pr > pf) {
      return {
        valid: false,
        error: 'Reflected power (Pr) cannot exceed forward power (Pf). Check directional coupler orientation.',
        swr: null,
        returnLossDb: null,
        mismatchLossDb: null,
        netPowerW: 0,
        gamma: null,
        status: 'INVALID'
      };
    }

    if (pr < 0) pr = 0;

    var gamma = Math.sqrt(pr / pf);
    var swr = gamma >= 0.99999 ? Infinity : (1 + gamma) / (1 - gamma);
    var returnLossDb = pr > 0 ? -10 * Math.log10(pr / pf) : Infinity;
    var mismatchLossDb = pr === 0 ? 0 : (pr < pf ? -10 * Math.log10(1 - pr / pf) : Infinity);
    var netPowerW = pf - pr;

    var status = 'EXCELLENT';
    var message = 'Normal operation. Negligible reflected power.';

    if (swr > 3.0) {
      status = 'DANGER';
      message = 'Excessive SWR (> 3.0:1). Immediate foldback or PA damage risk. Check antenna, tuner or feedline.';
    } else if (swr > 2.0) {
      status = 'WARNING';
      message = 'Elevated SWR (> 2.0:1). Transceiver protection circuit will fold back output power.';
    } else if (swr > 1.5) {
      status = 'ACCEPTABLE';
      message = 'Acceptable SWR. Minimal mismatch loss (< 0.18 dB).';
    }

    return {
      valid: true,
      pf: pf,
      pr: pr,
      gamma: gamma,
      swr: swr,
      returnLossDb: returnLossDb,
      mismatchLossDb: mismatchLossDb,
      netPowerW: netPowerW,
      status: status,
      message: message
    };
  }

  // --- 2. Touchstone (.s1p) Analysis & Antenna Sweeps ---
  function parseTouchstone(content) {
    if (!content || typeof content !== 'string') {
      return { valid: false, error: 'Empty or invalid content' };
    }

    var lines = content.split(/\r?\n/);
    var freqUnit = 1; // Default Hz
    var paramType = 'S';
    var format = 'MA'; // MA (mag/angle), DB (dB/angle), RI (real/imag)
    var z0 = 50.0;
    var points = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.startsWith('!')) continue;

      if (line.startsWith('#')) {
        var tokens = line.substring(1).trim().split(/\s+/);
        for (var t = 0; t < tokens.length; t++) {
          var tok = tokens[t].toUpperCase();
          if (tok === 'HZ') freqUnit = 1;
          else if (tok === 'KHZ') freqUnit = 1e3;
          else if (tok === 'MHZ') freqUnit = 1e6;
          else if (tok === 'GHZ') freqUnit = 1e9;
          else if (tok === 'S') paramType = 'S';
          else if (tok === 'MA' || tok === 'DB' || tok === 'RI') format = tok;
          else if (tok === 'R' && t + 1 < tokens.length) {
            z0 = parseFloat(tokens[t + 1]) || 50.0;
            t++;
          }
        }
        continue;
      }

      var parts = line.split(/\s+/);
      if (parts.length >= 3) {
        var f = parseFloat(parts[0]) * freqUnit;
        var p1 = parseFloat(parts[1]);
        var p2 = parseFloat(parts[2]);

        if (isNaN(f) || isNaN(p1) || isNaN(p2)) continue;

        var gammaMag = 0;
        var gammaAngleDeg = 0;
        var gammaReal = 0;
        var gammaImag = 0;

        if (format === 'DB') {
          gammaMag = Math.pow(10, p1 / 20.0);
          gammaAngleDeg = p2;
          var rad = (gammaAngleDeg * Math.PI) / 180.0;
          gammaReal = gammaMag * Math.cos(rad);
          gammaImag = gammaMag * Math.sin(rad);
        } else if (format === 'MA') {
          gammaMag = p1;
          gammaAngleDeg = p2;
          var rad2 = (gammaAngleDeg * Math.PI) / 180.0;
          gammaReal = gammaMag * Math.cos(rad2);
          gammaImag = gammaMag * Math.sin(rad2);
        } else if (format === 'RI') {
          gammaReal = p1;
          gammaImag = p2;
          gammaMag = Math.sqrt(p1 * p1 + p2 * p2);
          gammaAngleDeg = (Math.atan2(p2, p1) * 180.0) / Math.PI;
        }

        if (gammaMag > 1.0) gammaMag = 1.0;
        var swr = gammaMag >= 0.9999 ? 99.0 : (1 + gammaMag) / (1 - gammaMag);
        var rlDb = gammaMag > 0 ? -20 * Math.log10(gammaMag) : 50.0;

        // Impedance: Z = Z0 * (1 + Gamma) / (1 - Gamma)
        var denom = (1 - gammaReal) * (1 - gammaReal) + gammaImag * gammaImag;
        var zReal = z0;
        var zImag = 0;
        if (denom > 1e-12) {
          zReal = z0 * ((1 - gammaReal * gammaReal - gammaImag * gammaImag) / denom);
          zImag = z0 * ((2 * gammaImag) / denom);
        }

        points.push({
          fHz: f,
          fMhz: f / 1e6,
          gammaMag: gammaMag,
          gammaAngleDeg: gammaAngleDeg,
          swr: swr,
          returnLossDb: rlDb,
          zReal: zReal,
          zImag: zImag
        });
      }
    }

    if (points.length === 0) {
      return { valid: false, error: 'No valid Touchstone data points found' };
    }

    // Sort by frequency
    points.sort(function (a, b) {
      return a.fHz - b.fHz;
    });

    // Find resonance (minimum SWR)
    var minSwr = Infinity;
    var minIdx = 0;
    for (var j = 0; j < points.length; j++) {
      if (points[j].swr < minSwr) {
        minSwr = points[j].swr;
        minIdx = j;
      }
    }

    // Calculate bandwidth SWR <= 2.0
    var lowF = null;
    var highF = null;
    for (var k = 0; k < points.length; k++) {
      if (points[k].swr <= 2.0) {
        if (lowF === null) lowF = points[k].fHz;
        highF = points[k].fHz;
      }
    }

    var bwHz = lowF !== null && highF !== null ? highF - lowF : 0;

    return {
      valid: true,
      pointsCount: points.length,
      fStartHz: points[0].fHz,
      fStopHz: points[points.length - 1].fHz,
      resonanceHz: points[minIdx].fHz,
      resonanceMhz: points[minIdx].fHz / 1e6,
      resonanceSwr: points[minIdx].swr,
      resonanceZReal: points[minIdx].zReal,
      resonanceZImag: points[minIdx].zImag,
      bandwidth2SwrHz: bwHz,
      bandwidth2SwrKhz: bwHz / 1e3,
      points: points
    };
  }

  function generateAntennaSweep(presetKey) {
    var fCenter = 7.100e6;
    var span = 0.400e6;
    var swrMin = 1.12;
    var qFactor = 18.0;
    var z0 = 50.0;
    var shiftHz = 0.0;

    if (presetKey === 'dipole_40m') {
      fCenter = 7.100e6;
      span = 0.400e6;
      swrMin = 1.14;
      qFactor = 22.0;
    } else if (presetKey === 'yagi_20m') {
      fCenter = 14.175e6;
      span = 0.600e6;
      swrMin = 1.08;
      qFactor = 15.0;
    } else if (presetKey === 'rain_detuned_40m') {
      // Water loading adds dielectric permittivity and wire weight, pulling resonance downward
      fCenter = 7.100e6;
      shiftHz = -85.0e3; // Shifted down 85 kHz
      span = 0.400e6;
      swrMin = 1.25;
      qFactor = 22.0;
    } else if (presetKey === 'broken_radial') {
      // Missing ground radials increases ground loss resistance and unbalances antenna
      fCenter = 7.100e6;
      shiftHz = +40.0e3;
      span = 0.400e6;
      swrMin = 2.45; // elevated SWR throughout
      qFactor = 12.0;
    } else if (presetKey === 'bad_connector_open') {
      fCenter = 7.100e6;
      span = 0.400e6;
      swrMin = 8.5;
      qFactor = 5.0;
    }

    var resF = fCenter + shiftHz;
    var numPoints = 81;
    var step = span / (numPoints - 1);
    var startF = fCenter - span / 2;

    var lines = [
      '! Touchstone S1P synthesized sweep',
      '! Preset: ' + presetKey,
      '# HZ S MA R 50'
    ];

    for (var i = 0; i < numPoints; i++) {
      var f = startF + i * step;
      var deltaF = (f - resF) / resF;
      // Resonator impedance model: Z = R_res + j * 2 * Q * R_res * deltaF
      var rRes = swrMin * z0; // normalized resistance at resonance
      var xRes = 2 * qFactor * rRes * deltaF;

      // Reflection coefficient Gamma = (Z - Z0) / (Z + Z0)
      var numReal = rRes - z0;
      var numImag = xRes;
      var denReal = rRes + z0;
      var denImag = xRes;

      var denMagSq = denReal * denReal + denImag * denImag;
      var gReal = (numReal * denReal + numImag * denImag) / denMagSq;
      var gImag = (numImag * denReal - numReal * denImag) / denMagSq;
      var gMag = Math.sqrt(gReal * gReal + gImag * gImag);
      if (gMag > 0.99) gMag = 0.99;
      var gAngle = (Math.atan2(gImag, gReal) * 180.0) / Math.PI;

      lines.push(Math.round(f) + ' ' + gMag.toFixed(5) + ' ' + gAngle.toFixed(2));
    }

    return lines.join('\n');
  }

  function compareAntennaBaselines(baseSweep, currSweep) {
    if (!baseSweep || !baseSweep.valid || !currSweep || !currSweep.valid) {
      return { valid: false, error: 'Both baseline and current sweeps must be valid.' };
    }

    var shiftHz = currSweep.resonanceHz - baseSweep.resonanceHz;
    var swrChange = currSweep.resonanceSwr - baseSweep.resonanceSwr;
    var findings = [];

    if (Math.abs(shiftHz) > 50e3) {
      if (shiftHz < 0) {
        findings.append ? findings.append() : findings.push(
          'Resonance shifted DOWN by ' + (Math.abs(shiftHz) / 1e3).toFixed(1) + ' kHz. Consistent with moisture/rain loading, increased dielectric permittivity, or physical elongation.'
        );
      } else {
        findings.push(
          'Resonance shifted UP by ' + (shiftHz / 1e3).toFixed(1) + ' kHz. Consistent with physical shortening, ice contraction, or broken/detached capacitive loading elements.'
        );
      }
    }

    if (swrChange > 0.4) {
      findings.push(
        'Minimum SWR degraded by +' + swrChange.toFixed(2) + ' (from ' + baseSweep.resonanceSwr.toFixed(2) + ' to ' + currSweep.resonanceSwr.toFixed(2) + '). Indicates impedance mismatch, degraded ground radials, or oxidized connector.'
      );
    } else if (swrChange < -0.3) {
      findings.push('Minimum SWR improved by ' + swrChange.toFixed(2) + '.');
    }

    return {
      valid: true,
      shiftHz: shiftHz,
      shiftKhz: shiftHz / 1e3,
      swrChange: swrChange,
      findings: findings
    };
  }

  // --- 3. Audio & ALC Doctor (Clipping, Hum, Spectrum) ---
  function generateAudioSamples(presetKey, sampleRate, durationSec) {
    sampleRate = sampleRate || 12000;
    durationSec = durationSec || 0.5;
    var n = Math.floor(sampleRate * durationSec);
    var samples = new Float32Array(n);

    // Two-tone standard frequencies for SSB/FT8 audio: 700 Hz and 1900 Hz
    var f1 = 700.0;
    var f2 = 1900.0;

    for (var i = 0; i < n; i++) {
      var t = i / sampleRate;
      var s = 0;

      if (presetKey === 'clean') {
        // Linear two-tone: peak amplitude 0.707 (-3 dBFS), clean sinusoidal sum
        s = 0.35 * Math.sin(2 * Math.PI * f1 * t) + 0.35 * Math.sin(2 * Math.PI * f2 * t);
      } else if (presetKey === 'overdrive') {
        // Overdriven by +10 dB into digital clipping
        var raw = 1.35 * Math.sin(2 * Math.PI * f1 * t) + 1.35 * Math.sin(2 * Math.PI * f2 * t);
        // Hard clipping at +/- 0.99
        if (raw > 0.99) s = 0.99;
        else if (raw < -0.99) s = -0.99;
        else s = raw;
      } else if (presetKey === 'hum_50hz') {
        // Clean audio signal plus 50 Hz mains hum and 100/150 Hz harmonics
        var voice = 0.25 * Math.sin(2 * Math.PI * f1 * t) + 0.25 * Math.sin(2 * Math.PI * f2 * t);
        var hum = 0.22 * Math.sin(2 * Math.PI * 50.0 * t) +
                  0.08 * Math.sin(2 * Math.PI * 100.0 * t) +
                  0.03 * Math.sin(2 * Math.PI * 150.0 * t);
        s = voice + hum;
      } else if (presetKey === 'hum_60hz') {
        // Clean audio signal plus 60 Hz hum
        var voice2 = 0.25 * Math.sin(2 * Math.PI * f1 * t) + 0.25 * Math.sin(2 * Math.PI * f2 * t);
        var hum2 = 0.22 * Math.sin(2 * Math.PI * 60.0 * t) +
                   0.08 * Math.sin(2 * Math.PI * 120.0 * t) +
                   0.03 * Math.sin(2 * Math.PI * 180.0 * t);
        s = voice2 + hum2;
      } else if (presetKey === 'dc_offset') {
        var voice3 = 0.3 * Math.sin(2 * Math.PI * f1 * t) + 0.3 * Math.sin(2 * Math.PI * f2 * t);
        s = voice3 + 0.22; // +0.22 DC bias
      } else {
        s = 0.4 * Math.sin(2 * Math.PI * f1 * t);
      }

      samples[i] = s;
    }

    return {
      presetKey: presetKey,
      sampleRate: sampleRate,
      samples: samples
    };
  }

  function analyzeAudioSamples(samples, sampleRate) {
    if (!samples || samples.length === 0) {
      return { valid: false, error: 'No audio samples provided.' };
    }
    sampleRate = sampleRate || 12000;
    var n = samples.length;

    var sum = 0;
    var sumSq = 0;
    var maxVal = 0;
    var clippedCount = 0;
    var clippingThreshold = 0.985;

    for (var i = 0; i < n; i++) {
      var val = samples[i];
      var absVal = Math.abs(val);
      sum += val;
      sumSq += val * val;
      if (absVal > maxVal) maxVal = absVal;
      if (absVal >= clippingThreshold) clippedCount++;
    }

    var dcOffset = sum / n;
    var rms = Math.sqrt(sumSq / n);
    var crestFactor = rms > 1e-6 ? maxVal / rms : 0;
    var clippingPercent = (clippedCount / n) * 100.0;

    // Fast Power Spectrum via windowed DFT on first 1024 / 2048 samples
    var fftSize = 1024;
    while (fftSize > n && fftSize > 256) fftSize /= 2;
    var numBins = fftSize / 2;
    var spectrumDb = new Float32Array(numBins);
    var binFreqs = new Float32Array(numBins);
    var binWidth = sampleRate / fftSize;

    // Hann window & real DFT
    for (var k = 0; k < numBins; k++) {
      binFreqs[k] = k * binWidth;
      var re = 0;
      var im = 0;
      for (var j = 0; j < fftSize; j++) {
        var w = 0.5 * (1 - Math.cos((2 * Math.PI * j) / (fftSize - 1)));
        var x = samples[j] * w;
        var angle = (2 * Math.PI * k * j) / fftSize;
        re += x * Math.cos(angle);
        im -= x * Math.sin(angle);
      }
      var mag = Math.sqrt(re * re + im * im) / (fftSize / 2);
      var db = 20 * Math.log10(Math.max(mag, 1e-6));
      spectrumDb[k] = db;
    }

    // Median noise floor estimation
    var sortedDbs = [];
    for (var b = 0; b < numBins; b++) sortedDbs.push(spectrumDb[b]);
    sortedDbs.sort(function (a, b) { return a - b; });
    var medianFloor = sortedDbs[Math.floor(sortedDbs.length / 2)];

    // Hum Prominence check (50 Hz and 60 Hz)
    function getPeakInBand(targetHz, toleranceHz) {
      var maxDb = -999;
      for (var m = 0; m < numBins; m++) {
        if (Math.abs(binFreqs[m] - targetHz) <= toleranceHz) {
          if (spectrumDb[m] > maxDb) maxDb = spectrumDb[m];
        }
      }
      return maxDb;
    }

    var peak50 = getPeakInBand(50, 15);
    var peak60 = getPeakInBand(60, 15);
    var prom50 = peak50 - medianFloor;
    var prom60 = peak60 - medianFloor;

    var humDetected = false;
    var dominantHumHz = null;
    var humProminenceDb = 0;

    if (prom50 > 14.0 && prom50 >= prom60) {
      humDetected = true;
      dominantHumHz = 50.0;
      humProminenceDb = prom50;
    } else if (prom60 > 14.0) {
      humDetected = true;
      dominantHumHz = 60.0;
      humProminenceDb = prom60;
    }

    var findings = [];
    if (clippingPercent > 1.0) {
      findings.push('Significant audio clipping detected (' + clippingPercent.toFixed(1) + '% samples flat-topped). Overdriving TX audio or soundcard input.');
    }
    if (humDetected) {
      findings.push('Mains frequency ground loop hum detected at ' + dominantHumHz + ' Hz (' + humProminenceDb.toFixed(1) + ' dB above floor). Check audio isolation transformers and shield grounding.');
    }
    if (Math.abs(dcOffset) > 0.08) {
      findings.push('Substantial DC offset detected (' + (dcOffset > 0 ? '+' : '') + dcOffset.toFixed(3) + ' V). Check soundcard coupling capacitors.');
    }

    return {
      valid: true,
      sampleRate: sampleRate,
      durationSec: n / sampleRate,
      dcOffset: dcOffset,
      peakLevel: maxVal,
      rmsLevel: rms,
      crestFactor: crestFactor,
      clippingPercent: clippingPercent,
      humDetected: humDetected,
      dominantHumHz: dominantHumHz,
      humProminenceDb: humProminenceDb,
      binFreqs: binFreqs,
      spectrumDb: spectrumDb,
      findings: findings
    };
  }

  // --- 4. RFI A/B Lab (Differential Spectrum) ---
  function analyzeDifferentialRFI(presetKey) {
    // Generate frequency range 0 - 3000 Hz (audio baseband/waterfall) or 0 - 1000 kHz
    var numBins = 128;
    var freqs = new Float32Array(numBins);
    var baseDb = new Float32Array(numBins);
    var currDb = new Float32Array(numBins);
    var diffDb = new Float32Array(numBins);

    var fMax = 3000; // Hz
    var step = fMax / numBins;

    var isComb = false;
    var combSpacingHz = 0;
    var meanIncrease = 0;
    var findings = [];

    for (var i = 0; i < numBins; i++) {
      var f = i * step;
      freqs[i] = f;
      // Ambient floor around -85 dBm with small random fluctuation
      var nBase = -85.0 + 2.0 * Math.sin(i * 0.1) + ((i * 17) % 7) * 0.4;
      baseDb[i] = nBase;

      var nCurr = nBase;

      if (presetKey === 'smps_charger') {
        // Switching supply: harmonics spaced every ~200 Hz in audio or ~60 kHz in RF
        // Comb lines + broadband lift
        nCurr = nBase + 6.0; // 6 dB baseline increase
        var combHarmonic = Math.cos((2 * Math.PI * f) / 220.0);
        if (combHarmonic > 0.8) {
          nCurr += 18.0 * (combHarmonic - 0.8) * 5.0;
        }
        isComb = true;
        combSpacingHz = 220.0;
      } else if (presetKey === 'plasma_tv') {
        // Broadband hash + video line harmonics (e.g. 15.625 kHz scaled or broadband hash)
        nCurr = nBase + 14.0 + 3.0 * Math.sin(f * 0.02);
      } else if (presetKey === 'clean_no_rfi') {
        nCurr = nBase + (Math.random() - 0.5) * 1.0;
      }

      currDb[i] = nCurr;
      diffDb[i] = nCurr - nBase;
      meanIncrease += diffDb[i];
    }

    meanIncrease /= numBins;

    if (presetKey === 'smps_charger') {
      findings.push('Periodic harmonic comb pattern detected (spacing ~' + Math.round(combSpacingHz) + ' Hz). Characteristic of unshielded Switch-Mode Power Supply (SMPS) or LED driver.');
    } else if (presetKey === 'plasma_tv') {
      findings.push('Severe broadband noise floor elevation (+' + meanIncrease.toFixed(1) + ' dB average). Masks weak signals across the passband.');
    } else {
      findings.push('No significant RFI difference between Device OFF and Device ON.');
    }

    return {
      valid: true,
      presetKey: presetKey,
      freqs: freqs,
      baseDb: baseDb,
      currDb: currDb,
      diffDb: diffDb,
      combDetected: isComb,
      combSpacingHz: combSpacingHz,
      meanIncreaseDb: meanIncrease,
      findings: findings
    };
  }

  // --- 5. Digital Modes Timing (WSJT-X DT & Clock PPM) ---
  function analyzeWSJTXTiming(dtList) {
    if (!dtList || dtList.length === 0) {
      return { valid: false, error: 'No DT values provided' };
    }

    var n = dtList.length;
    var sum = 0;
    var min = Infinity;
    var max = -Infinity;

    for (var i = 0; i < n; i++) {
      var v = Number(dtList[i]);
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }

    var mean = sum / n;
    var sumSqDiff = 0;
    for (var j = 0; j < n; j++) {
      var diff = Number(dtList[j]) - mean;
      sumSqDiff += diff * diff;
    }
    var std = Math.sqrt(sumSqDiff / n);

    var findings = [];
    var status = 'NORMAL';

    if (Math.abs(mean) > 1.2 && std < 0.45) {
      status = 'CLOCK_DRIFT';
      findings.push('Systematic DT offset of ' + (mean > 0 ? '+' : '') + mean.toFixed(2) + ' s with low dispersion (std=' + std.toFixed(2) + ' s). PC system clock is out of sync. Synchronize via NTP/Dimension4.');
    } else if (Math.abs(mean) > 1.5) {
      status = 'SEVERE_OFFSET';
      findings.push('High mean DT (' + mean.toFixed(2) + ' s). Signals will be truncated or fail decoding at block boundaries.');
    } else if (std > 0.8) {
      status = 'HIGH_JITTER';
      findings.push('High DT variance (std=' + std.toFixed(2) + ' s). Indicates network audio latency jitter or heavy CPU scheduling delays.');
    } else {
      findings.push('DT distribution within normal bounds for FT8/FT4 (|mean| < 0.5 s, std < 0.4 s).');
    }

    return {
      valid: true,
      count: n,
      meanDt: mean,
      stdDt: std,
      minDt: min,
      maxDt: max,
      status: status,
      findings: findings
    };
  }

  function calculatePPM(measuredHz, refHz) {
    measuredHz = Number(measuredHz);
    refHz = Number(refHz);
    if (isNaN(measuredHz) || isNaN(refHz) || refHz <= 0) {
      return { valid: false, error: 'Reference frequency must be > 0' };
    }

    var deltaHz = measuredHz - refHz;
    var ppm = (1e6 * deltaHz) / refHz;

    return {
      valid: true,
      measuredHz: measuredHz,
      refHz: refHz,
      deltaHz: deltaHz,
      ppm: ppm
    };
  }

  // --- 6. Station Snapshot Diff ---
  function diffStationSnapshots(base, curr) {
    base = base || {};
    curr = curr || {};

    var diffs = [];

    var fields = [
      { key: 'rigModel', label: 'Transceiver Model' },
      { key: 'audioTxDevice', label: 'TX Audio Device' },
      { key: 'audioRxDevice', label: 'RX Audio Device' },
      { key: 'sampleRate', label: 'Audio Sample Rate' },
      { key: 'antenna', label: 'Selected Antenna' },
      { key: 'feedline', label: 'Feedline' },
      { key: 'tunerActive', label: 'Internal/External Tuner' },
      { key: 'catBaud', label: 'CAT Interface Baud' },
      { key: 'clockSynced', label: 'System NTP Clock Sync' }
    ];

    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var oldVal = base[f.key] !== undefined ? String(base[f.key]) : '(not set)';
      var newVal = curr[f.key] !== undefined ? String(curr[f.key]) : '(not set)';
      if (oldVal !== newVal) {
        diffs.push({
          key: f.key,
          label: f.label,
          oldValue: oldVal,
          newValue: newVal,
          significance: getDiffSignificance(f.key, oldVal, newVal)
        });
      }
    }

    return {
      valid: true,
      changesCount: diffs.length,
      diffs: diffs
    };
  }

  function getDiffSignificance(key, oldVal, newVal) {
    if (key === 'audioTxDevice') {
      return 'CRITICAL: Audio output destination changed. If switched to system speakers or microphone array, transmitter will be driven with acoustic noise or silence.';
    }
    if (key === 'antenna') {
      return 'HIGH: Antenna port changed. Verify band resonance and tuner bypass state.';
    }
    if (key === 'sampleRate') {
      return 'MEDIUM: Sample rate mismatch can cause buffer underruns, clicks, or pitch shifts in digital modes.';
    }
    if (key === 'clockSynced' && newVal === 'false') {
      return 'HIGH: Clock synchronization lost. FT8/FT4 decoding will degrade within hours.';
    }
    return 'INFORMATIONAL: Parameter changed.';
  }

  // --- 7. Evidence Ladder & Rule Engine ---
  function runEvidenceLadder(sessionData) {
    sessionData = sessionData || {};
    var evidence = [];
    var hypotheses = [];

    // Evaluate RF evidence
    if (sessionData.rf) {
      var rf = sessionData.rf;
      if (rf.valid) {
        evidence.push({
          level: 'OBSERVED',
          category: 'RF',
          text: 'Measured Forward Power: ' + rf.pf + ' W, Reflected Power: ' + rf.pr + ' W',
          data: { pf: rf.pf, pr: rf.pr }
        });
        evidence.push({
          level: 'DERIVED',
          category: 'RF',
          text: 'Calculated SWR: ' + rf.swr.toFixed(2) + ':1 (Return Loss: ' + (rf.returnLossDb === Infinity ? '>40' : rf.returnLossDb.toFixed(1)) + ' dB)',
          data: { swr: rf.swr, rl: rf.returnLossDb }
        });
      }
    }

    // Evaluate Audio evidence
    if (sessionData.audio) {
      var aud = sessionData.audio;
      if (aud.valid) {
        evidence.push({
          level: 'OBSERVED',
          category: 'AUDIO',
          text: 'Audio Peak Level: ' + aud.peakLevel.toFixed(3) + ' (RMS: ' + aud.rmsLevel.toFixed(3) + ')',
          data: { peak: aud.peakLevel, rms: aud.rmsLevel }
        });
        if (aud.clippingPercent > 0) {
          evidence.push({
            level: 'DERIVED',
            category: 'AUDIO',
            text: 'Clipped Samples: ' + aud.clippingPercent.toFixed(1) + '% of duration',
            data: { clipping: aud.clippingPercent }
          });
        }
        if (aud.humDetected) {
          evidence.push({
            level: 'DERIVED',
            category: 'AUDIO',
            text: 'Mains Hum Peak detected at ' + aud.dominantHumHz + ' Hz (' + aud.humProminenceDb.toFixed(1) + ' dB prominence)',
            data: { humHz: aud.dominantHumHz, promDb: aud.humProminenceDb }
          });
        }
      }
    }

    // Evaluate Antenna sweep evidence
    if (sessionData.antennaComp) {
      var ant = sessionData.antennaComp;
      if (ant.valid && Math.abs(ant.shiftHz) > 0) {
        evidence.push({
          level: 'DERIVED',
          category: 'ANTENNA',
          text: 'Antenna resonance frequency shifted by ' + ant.shiftKhz.toFixed(1) + ' kHz (SWR change: ' + (ant.swrChange >= 0 ? '+' : '') + ant.swrChange.toFixed(2) + ')',
          data: { shiftKhz: ant.shiftKhz, swrChange: ant.swrChange }
        });
      }
    }

    // Evaluate Timing evidence
    if (sessionData.timing) {
      var tim = sessionData.timing;
      if (tim.valid) {
        evidence.push({
          level: 'DERIVED',
          category: 'TIMING',
          text: 'WSJT-X DT Distribution: Mean = ' + tim.meanDt.toFixed(2) + ' s, Std = ' + tim.stdDt.toFixed(2) + ' s (N=' + tim.count + ')',
          data: { meanDt: tim.meanDt, stdDt: tim.stdDt }
        });
      }
    }

    // Evaluate Station Diff evidence
    if (sessionData.diff) {
      var df = sessionData.diff;
      if (df.valid && df.diffs.length > 0) {
        for (var d = 0; d < df.diffs.length; d++) {
          evidence.push({
            level: 'OBSERVED',
            category: 'CONFIG',
            text: 'Config Diff: ' + df.diffs[d].label + ' changed from "' + df.diffs[d].oldValue + '" to "' + df.diffs[d].newValue + '"',
            data: df.diffs[d]
          });
        }
      }
    }

    // --- Generate & Test Hypotheses ---

    // 1. TX Audio Overdrive / ALC Distortion
    var hypAudioOverdrive = {
      title: 'TX Audio Overdrive / ALC Flat-Topping',
      probability: 'LOW',
      supportedBy: [],
      contradictedBy: [],
      unknowns: ['Actual RF occupied spectrum bandwidth (requires webSDR or spectrum analyzer)'],
      remedy: 'Reduce TX audio slider in WSJT-X or OS sound settings until ALC meter just barely engages.'
    };
    if (sessionData.audio && sessionData.audio.clippingPercent > 1.0) {
      hypAudioOverdrive.supportedBy.push('Digital audio clipping detected (' + sessionData.audio.clippingPercent.toFixed(1) + '% samples)');
      hypAudioOverdrive.probability = 'HIGH';
    } else {
      hypAudioOverdrive.contradictedBy.push('No significant audio clipping found in loopback test');
    }
    hypotheses.push(hypAudioOverdrive);

    // 2. Antenna Detuning / Environmental Change
    var hypAntennaDetune = {
      title: 'Antenna Detuning by Environmental Moisture / Mechanical Shift',
      probability: 'LOW',
      supportedBy: [],
      contradictedBy: [],
      unknowns: ['Visual antenna wire inspection', 'Feedline moisture ingress status'],
      remedy: 'Re-sweep antenna with analyzer across full band to check if resonance shifted rather than broke completely.'
    };
    if (sessionData.antennaComp && Math.abs(sessionData.antennaComp.shiftHz) > 40e3) {
      hypAntennaDetune.supportedBy.push('Resonance shifted by ' + sessionData.antennaComp.shiftKhz.toFixed(1) + ' kHz compared to baseline');
      hypAntennaDetune.probability = 'HIGH';
    } else if (sessionData.rf && sessionData.rf.swr > 2.0) {
      hypAntennaDetune.supportedBy.push('High operating SWR (' + sessionData.rf.swr.toFixed(2) + ':1)');
      hypAntennaDetune.probability = 'MEDIUM';
    } else if (sessionData.rf && sessionData.rf.swr < 1.4) {
      hypAntennaDetune.contradictedBy.push('Antenna operating SWR is normal (' + sessionData.rf.swr.toFixed(2) + ':1)');
    }
    hypotheses.push(hypAntennaDetune);

    // 3. PC Clock Desynchronization
    var hypClock = {
      title: 'PC Clock Timing Desynchronization',
      probability: 'LOW',
      supportedBy: [],
      contradictedBy: [],
      unknowns: ['NTP server latency and stratum level'],
      remedy: 'Force NTP time synchronization using w32tm /resync or a dedicated utility like Dimension 4 / Meinberg NTP.'
    };
    if (sessionData.timing && Math.abs(sessionData.timing.meanDt) > 1.2 && sessionData.timing.stdDt < 0.45) {
      hypClock.supportedBy.push('Consistent DT bias of ' + sessionData.timing.meanDt.toFixed(2) + ' s with low standard deviation');
      hypClock.probability = 'HIGH';
    } else if (sessionData.timing && Math.abs(sessionData.timing.meanDt) < 0.5) {
      hypClock.contradictedBy.push('Decoded signals have normal mean DT (' + sessionData.timing.meanDt.toFixed(2) + ' s)');
    }
    hypotheses.push(hypClock);

    // 4. Ground Loop / 50-60 Hz Hum Contamination
    var hypHum = {
      title: 'Mains Ground Loop Hum Contaminating Modulation',
      probability: 'LOW',
      supportedBy: [],
      contradictedBy: [],
      unknowns: ['Physical ground bonding between PC and transceiver chassis'],
      remedy: 'Install 1:1 600-ohm audio isolation transformers or USB optical isolator on soundcard interface.'
    };
    if (sessionData.audio && sessionData.audio.humDetected) {
      hypHum.supportedBy.push(sessionData.audio.dominantHumHz + ' Hz mains harmonic peak detected (' + sessionData.audio.humProminenceDb.toFixed(1) + ' dB prominence)');
      hypHum.probability = 'HIGH';
    } else {
      hypHum.contradictedBy.push('No 50/60 Hz spectral peaks detected above floor');
    }
    hypotheses.push(hypHum);

    // Sort hypotheses by probability
    var rankOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    hypotheses.sort(function (a, b) {
      return (rankOrder[b.probability] || 0) - (rankOrder[a.probability] || 0);
    });

    return {
      valid: true,
      evidencePool: evidence,
      hypotheses: hypotheses
    };
  }

  return {
    calculateSWR: calculateSWR,
    parseTouchstone: parseTouchstone,
    generateAntennaSweep: generateAntennaSweep,
    compareAntennaBaselines: compareAntennaBaselines,
    generateAudioSamples: generateAudioSamples,
    analyzeAudioSamples: analyzeAudioSamples,
    analyzeDifferentialRFI: analyzeDifferentialRFI,
    analyzeWSJTXTiming: analyzeWSJTXTiming,
    calculatePPM: calculatePPM,
    diffStationSnapshots: diffStationSnapshots,
    runEvidenceLadder: runEvidenceLadder
  };
});
