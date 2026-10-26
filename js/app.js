/**
 * app.js - Ham Radio Doctor Interactive Controller & Visualizer
 * Pair programming: Loren (lorenhey) & Antigravity
 */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var engine = window.HamDoctorEngine;
  if (!engine) {
    console.error('HamDoctorEngine not found!');
    return;
  }

  // --- Global State ---
  var state = {
    activeTab: 'overview',
    rf: {
      pf: 100,
      pr: 1.8,
      calc: null
    },
    antenna: {
      preset: 'dipole_40m',
      sweep: null,
      baselineSweep: null,
      comparison: null
    },
    audio: {
      preset: 'clean',
      samples: null,
      analysis: null
    },
    rfi: {
      preset: 'clean_no_rfi',
      analysis: null
    },
    timing: {
      preset: 'normal',
      dtList: [0.04, -0.02, 0.08, 0.01, -0.05, 0.03, 0.02],
      analysis: null
    },
    ppm: {
      measuredHz: 10000000,
      refHz: 10000000,
      calc: null
    },
    stationDiff: {
      scenario: 'audio_routing_swap',
      diff: null
    },
    ladder: null
  };

  // --- Tab Navigation ---
  var tabButtons = document.querySelectorAll('.nav-tab');
  var tabPanes = document.querySelectorAll('.tab-pane');

  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = btn.getAttribute('data-tab');
      tabButtons.forEach(function (b) { b.classList.remove('active'); });
      tabPanes.forEach(function (p) { p.classList.remove('active'); });

      btn.classList.add('active');
      var pane = document.getElementById('pane-' + target);
      if (pane) pane.classList.add('active');

      state.activeTab = target;
      redrawCurrentCharts();
    });
  });

  // --- 1. RF & SWR Controls ---
  var inputPf = document.getElementById('input-pf');
  var inputPr = document.getElementById('input-pr');
  var rangePf = document.getElementById('range-pf');
  var rangePr = document.getElementById('range-pr');

  function updateRfState() {
    var pf = parseFloat(inputPf.value) || 100;
    var pr = parseFloat(inputPr.value) || 0;
    state.rf.pf = pf;
    state.rf.pr = pr;
    state.rf.calc = engine.calculateSWR(pf, pr);

    var calc = state.rf.calc;
    document.getElementById('val-swr').textContent = calc.valid ? (calc.swr === Infinity ? '∞' : calc.swr.toFixed(2)) : 'ERR';
    document.getElementById('val-rl').textContent = calc.valid ? (calc.returnLossDb === Infinity ? '> 40.0' : calc.returnLossDb.toFixed(1)) : '--';
    document.getElementById('val-ml').textContent = calc.valid ? calc.mismatchLossDb.toFixed(2) : '--';
    document.getElementById('val-pnet').textContent = calc.valid ? calc.netPowerW.toFixed(1) : '--';
    document.getElementById('val-gamma').textContent = calc.valid ? calc.gamma.toFixed(3) : '--';

    var statusEl = document.getElementById('rf-status-badge');
    if (statusEl) {
      statusEl.className = 'status-badge ' + (calc.status === 'EXCELLENT' ? 'ok' : (calc.status === 'WARNING' ? 'warning' : 'danger'));
      statusEl.textContent = calc.status;
    }
    var msgEl = document.getElementById('rf-status-msg');
    if (msgEl) msgEl.textContent = calc.message;

    updateStationChain();
    updateEvidenceLadder();
  }

  if (inputPf && inputPr) {
    inputPf.addEventListener('input', function () { rangePf.value = inputPf.value; updateRfState(); });
    inputPr.addEventListener('input', function () { rangePr.value = inputPr.value; updateRfState(); });
    rangePf.addEventListener('input', function () { inputPf.value = rangePf.value; updateRfState(); });
    rangePr.addEventListener('input', function () { inputPr.value = rangePr.value; updateRfState(); });
  }

  // Preset buttons for RF
  document.querySelectorAll('.btn-rf-preset').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var pf = parseFloat(btn.getAttribute('data-pf'));
      var pr = parseFloat(btn.getAttribute('data-pr'));
      inputPf.value = pf; rangePf.value = pf;
      inputPr.value = pr; rangePr.value = pr;
      updateRfState();
    });
  });

  // --- 2. Antenna Touchstone Sweeps ---
  var selectAntennaPreset = document.getElementById('select-antenna-preset');
  var canvasSwr = document.getElementById('canvas-swr');

  function updateAntennaSweep() {
    var key = selectAntennaPreset ? selectAntennaPreset.value : 'dipole_40m';
    state.antenna.preset = key;

    // Generate baseline (always standard dipole 40m or yagi 20m)
    var baseKey = key.includes('20m') ? 'yagi_20m' : 'dipole_40m';
    var baseText = engine.generateAntennaSweep(baseKey);
    state.antenna.baselineSweep = engine.parseTouchstone(baseText);

    // Generate active sweep
    var currText = engine.generateAntennaSweep(key);
    state.antenna.sweep = engine.parseTouchstone(currText);

    // Compare
    state.antenna.comparison = engine.compareAntennaBaselines(
      state.antenna.baselineSweep,
      state.antenna.sweep
    );

    var sw = state.antenna.sweep;
    if (sw && sw.valid) {
      document.getElementById('val-ant-fres').textContent = sw.resonanceMhz.toFixed(3);
      document.getElementById('val-ant-swrmin').textContent = sw.resonanceSwr.toFixed(2);
      document.getElementById('val-ant-zres').textContent = Math.round(sw.resonanceZReal) + (sw.resonanceZImag >= 0 ? '+' : '') + Math.round(sw.resonanceZImag) + 'j';
      document.getElementById('val-ant-bw').textContent = sw.bandwidth2SwrKhz ? sw.bandwidth2SwrKhz.toFixed(0) : '--';
    }

    var comp = state.antenna.comparison;
    var compEl = document.getElementById('ant-comparison-msg');
    if (compEl) {
      if (comp.findings.length > 0) {
        compEl.innerHTML = comp.findings.map(function (f) { return '• ' + f; }).join('<br>');
      } else {
        compEl.textContent = 'Sweep perfectly matches baseline. No resonance or SWR shift detected.';
      }
    }

    drawSwrPlot(canvasSwr, state.antenna.sweep, state.antenna.baselineSweep);
    updateStationChain();
    updateEvidenceLadder();
  }

  if (selectAntennaPreset) {
    selectAntennaPreset.addEventListener('change', updateAntennaSweep);
  }

  // --- 3. Audio & ALC Doctor ---
  var selectAudioPreset = document.getElementById('select-audio-preset');
  var canvasWaveform = document.getElementById('canvas-audio-wave');
  var canvasAudioSpectrum = document.getElementById('canvas-audio-spec');

  function updateAudioDoctor() {
    var key = selectAudioPreset ? selectAudioPreset.value : 'clean';
    state.audio.preset = key;
    var gen = engine.generateAudioSamples(key, 12000, 0.4);
    state.audio.samples = gen.samples;
    state.audio.analysis = engine.analyzeAudioSamples(gen.samples, gen.sampleRate);

    var an = state.audio.analysis;
    if (an && an.valid) {
      document.getElementById('val-aud-peak').textContent = an.peakLevel.toFixed(3);
      document.getElementById('val-aud-rms').textContent = an.rmsLevel.toFixed(3);
      document.getElementById('val-aud-clip').textContent = an.clippingPercent.toFixed(1);
      document.getElementById('val-aud-dc').textContent = (an.dcOffset >= 0 ? '+' : '') + an.dcOffset.toFixed(3);
      document.getElementById('val-aud-crest').textContent = an.crestFactor.toFixed(2);

      var humEl = document.getElementById('val-aud-hum');
      if (an.humDetected) {
        humEl.textContent = an.dominantHumHz + ' Hz (+' + an.humProminenceDb.toFixed(0) + ' dB)';
        humEl.style.color = 'var(--danger)';
      } else {
        humEl.textContent = 'None detected';
        humEl.style.color = 'var(--success)';
      }

      var findingsEl = document.getElementById('audio-findings-msg');
      if (findingsEl) {
        if (an.findings.length > 0) {
          findingsEl.innerHTML = an.findings.map(function (f) { return '• ' + f; }).join('<br>');
        } else {
          findingsEl.textContent = 'Audio levels normal. No clipping, DC offset or 50/60 Hz hum detected.';
        }
      }

      drawWaveform(canvasWaveform, an.valid ? gen.samples : []);
      drawAudioSpectrum(canvasAudioSpectrum, an.binFreqs, an.spectrumDb, an.dominantHumHz);
    }

    updateStationChain();
    updateEvidenceLadder();
  }

  if (selectAudioPreset) {
    selectAudioPreset.addEventListener('change', updateAudioDoctor);
  }

  // --- 4. RFI A/B Lab ---
  var selectRfiPreset = document.getElementById('select-rfi-preset');
  var canvasRfi = document.getElementById('canvas-rfi');

  function updateRfiLab() {
    var key = selectRfiPreset ? selectRfiPreset.value : 'clean_no_rfi';
    state.rfi.preset = key;
    state.rfi.analysis = engine.analyzeDifferentialRFI(key);

    var an = state.rfi.analysis;
    if (an && an.valid) {
      document.getElementById('val-rfi-rise').textContent = (an.meanIncreaseDb >= 0 ? '+' : '') + an.meanIncreaseDb.toFixed(1);
      document.getElementById('val-rfi-comb').textContent = an.combDetected ? 'YES (~' + Math.round(an.combSpacingHz) + ' Hz)' : 'NO';

      var rfiMsg = document.getElementById('rfi-findings-msg');
      if (rfiMsg) {
        rfiMsg.innerHTML = an.findings.map(function (f) { return '• ' + f; }).join('<br>');
      }
      drawRfiPlot(canvasRfi, an.freqs, an.baseDb, an.currDb, an.diffDb);
    }
    updateEvidenceLadder();
  }

  if (selectRfiPreset) {
    selectRfiPreset.addEventListener('change', updateRfiLab);
  }

  // --- 5. Digital Timing & Clock PPM ---
  var selectTimingPreset = document.getElementById('select-timing-preset');
  var canvasDt = document.getElementById('canvas-dt');
  var inputPpmMeas = document.getElementById('input-ppm-meas');
  var inputPpmRef = document.getElementById('input-ppm-ref');

  function updateDigitalTiming() {
    var key = selectTimingPreset ? selectTimingPreset.value : 'normal';
    state.timing.preset = key;

    var dt = [0.04, -0.02, 0.08, 0.01, -0.05, 0.03, 0.02];
    if (key === 'drift') {
      dt = [1.81, 1.79, 1.84, 1.80, 1.82, 1.81, 1.78, 1.83];
    } else if (key === 'jitter') {
      dt = [-1.2, 0.8, -0.4, 1.4, -0.9, 0.5, 1.1, -1.5];
    }

    state.timing.dtList = dt;
    state.timing.analysis = engine.analyzeWSJTXTiming(dt);

    var an = state.timing.analysis;
    if (an && an.valid) {
      document.getElementById('val-dt-mean').textContent = (an.meanDt >= 0 ? '+' : '') + an.meanDt.toFixed(2);
      document.getElementById('val-dt-std').textContent = an.stdDt.toFixed(2);
      document.getElementById('val-dt-count').textContent = an.count;

      var dtStatusEl = document.getElementById('val-dt-status');
      if (dtStatusEl) {
        dtStatusEl.textContent = an.status;
        dtStatusEl.className = 'status-badge ' + (an.status === 'NORMAL' ? 'ok' : 'danger');
      }

      var dtFindings = document.getElementById('dt-findings-msg');
      if (dtFindings) {
        dtFindings.innerHTML = an.findings.map(function (f) { return '• ' + f; }).join('<br>');
      }

      drawDtHistogram(canvasDt, dt, an.meanDt, an.stdDt);
    }

    updatePpmCalc();
    updateStationChain();
    updateEvidenceLadder();
  }

  function updatePpmCalc() {
    var fm = parseFloat(inputPpmMeas ? inputPpmMeas.value : 10000000);
    var fr = parseFloat(inputPpmRef ? inputPpmRef.value : 10000000);
    state.ppm.calc = engine.calculatePPM(fm, fr);
    var p = state.ppm.calc;
    if (p && p.valid) {
      document.getElementById('val-ppm-err').textContent = (p.ppm >= 0 ? '+' : '') + p.ppm.toFixed(2);
      document.getElementById('val-ppm-delta').textContent = (p.deltaHz >= 0 ? '+' : '') + p.deltaHz.toFixed(1);
    }
  }

  if (selectTimingPreset) selectTimingPreset.addEventListener('change', updateDigitalTiming);
  if (inputPpmMeas && inputPpmRef) {
    inputPpmMeas.addEventListener('input', updatePpmCalc);
    inputPpmRef.addEventListener('input', updatePpmCalc);
  }

  // --- 6. Station Snapshot Diff ---
  var selectDiffScenario = document.getElementById('select-diff-scenario');

  function updateStationDiff() {
    var sc = selectDiffScenario ? selectDiffScenario.value : 'audio_routing_swap';
    state.stationDiff.scenario = sc;

    var good = {
      rigModel: 'Icom IC-7300',
      audioTxDevice: 'USB Audio CODEC',
      audioRxDevice: 'USB Audio CODEC',
      sampleRate: '48000 Hz',
      antenna: '40m Inverted V',
      feedline: 'RG-213 (22m)',
      tunerActive: 'Bypassed',
      catBaud: '19200',
      clockSynced: 'true'
    };

    var curr = JSON.parse(JSON.stringify(good));

    if (sc === 'audio_routing_swap') {
      curr.audioTxDevice = 'Microphone Array (Realtek HD Audio)';
    } else if (sc === 'samplerate_mismatch') {
      curr.sampleRate = '44100 Hz';
    } else if (sc === 'antenna_switch_wrong') {
      curr.antenna = 'Dummy Load (Port 2)';
    } else if (sc === 'clock_lost') {
      curr.clockSynced = 'false';
    } else if (sc === 'no_change') {
      // identical
    }

    state.stationDiff.diff = engine.diffStationSnapshots(good, curr);
    var d = state.stationDiff.diff;

    var tbody = document.getElementById('diff-table-body');
    if (tbody) {
      if (d.changesCount === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--success);">✓ Configuration is completely identical to Last Known Good state.</td></tr>';
      } else {
        tbody.innerHTML = d.diffs.map(function (item) {
          return '<tr>' +
            '<td><strong>' + item.label + '</strong></td>' +
            '<td><span class="diff-old">' + item.oldValue + '</span></td>' +
            '<td><span class="diff-new">' + item.newValue + '</span></td>' +
            '<td style="font-size:0.8rem; color:var(--text-muted);">' + item.significance + '</td>' +
            '</tr>';
        }).join('');
      }
    }

    updateStationChain();
    updateEvidenceLadder();
  }

  if (selectDiffScenario) selectDiffScenario.addEventListener('change', updateStationDiff);

  // --- 7. Station Chain Banner Status ---
  function updateStationChain() {
    // Nodes: pc, audio, rig, feedline, antenna
    var nodePc = document.getElementById('chain-pc');
    var nodeAudio = document.getElementById('chain-audio');
    var nodeRig = document.getElementById('chain-rig');
    var nodeAnt = document.getElementById('chain-ant');

    if (nodePc) {
      var clockOk = state.timing.analysis && state.timing.analysis.status === 'NORMAL';
      nodePc.className = 'chain-node ' + (clockOk ? 'status-ok' : 'status-crit');
      nodePc.querySelector('.chain-status').textContent = clockOk ? '✓ NTP Sync' : '! Clock Drift';
    }

    if (nodeAudio) {
      var isClip = state.audio.analysis && state.audio.analysis.clippingPercent > 1.0;
      var isHum = state.audio.analysis && state.audio.analysis.humDetected;
      var isSwap = state.stationDiff.diff && state.stationDiff.diff.diffs.some(function (d) { return d.key === 'audioTxDevice'; });

      if (isClip || isSwap) {
        nodeAudio.className = 'chain-node status-crit';
        nodeAudio.querySelector('.chain-status').textContent = isSwap ? '! Wrong Device' : '! Clipping ' + state.audio.analysis.clippingPercent.toFixed(0) + '%';
      } else if (isHum) {
        nodeAudio.className = 'chain-node status-warn';
        nodeAudio.querySelector('.chain-status').textContent = '! Hum 50/60Hz';
      } else {
        nodeAudio.className = 'chain-node status-ok';
        nodeAudio.querySelector('.chain-status').textContent = '✓ Linear';
      }
    }

    if (nodeRig) {
      var rf = state.rf.calc;
      var isHighSwr = rf && rf.swr > 2.0;
      nodeRig.className = 'chain-node ' + (isHighSwr ? 'status-warn' : 'status-ok');
      nodeRig.querySelector('.chain-status').textContent = isHighSwr ? '! Foldback' : '✓ Normal';
    }

    if (nodeAnt) {
      var antSwr = state.rf.calc ? state.rf.calc.swr : 1.2;
      var isDetuned = state.antenna.comparison && Math.abs(state.antenna.comparison.shiftKhz) > 40;
      if (antSwr > 3.0 || isDetuned) {
        nodeAnt.className = 'chain-node ' + (antSwr > 3.0 ? 'status-crit' : 'status-warn');
        nodeAnt.querySelector('.chain-status').textContent = antSwr > 3.0 ? '! SWR ' + antSwr.toFixed(1) : '! Shifted ' + state.antenna.comparison.shiftKhz.toFixed(0) + 'kHz';
      } else {
        nodeAnt.className = 'chain-node status-ok';
        nodeAnt.querySelector('.chain-status').textContent = '✓ Matched';
      }
    }
  }

  // --- 8. Evidence Ladder Synthesizer ---
  function updateEvidenceLadder() {
    var sessionData = {
      rf: state.rf.calc,
      audio: state.audio.analysis,
      antennaComp: state.antenna.comparison,
      timing: state.timing.analysis,
      diff: state.stationDiff.diff
    };

    state.ladder = engine.runEvidenceLadder(sessionData);
    var ladder = state.ladder;

    // Render Evidence List
    var evCountEl = document.getElementById('evidence-count');
    if (evCountEl) evCountEl.textContent = ladder.evidencePool.length;

    var evListEl = document.getElementById('evidence-pool-list');
    if (evListEl) {
      evListEl.innerHTML = ladder.evidencePool.map(function (ev) {
        var badgeClass = ev.level === 'OBSERVED' ? 'ok' : 'warning';
        return '<li class="evidence-item">' +
          '<span class="status-badge ' + badgeClass + '" style="font-size:0.65rem; padding:0.1rem 0.35rem;">' + ev.level + '</span> ' +
          '<strong>[' + ev.category + ']</strong> ' + ev.text +
          '</li>';
      }).join('');
    }

    // Render Hypotheses
    var hypContainer = document.getElementById('hypotheses-container');
    if (hypContainer) {
      hypContainer.innerHTML = ladder.hypotheses.map(function (hyp) {
        var cardClass = hyp.probability === 'HIGH' ? 'high' : (hyp.probability === 'MEDIUM' ? 'medium' : 'low');
        var badgeClass = hyp.probability === 'HIGH' ? 'danger' : (hyp.probability === 'MEDIUM' ? 'warning' : 'ok');

        var supHtml = hyp.supportedBy.map(function (s) {
          return '<li class="evidence-item supports"><span>[+] SUPPORTS:</span> ' + s + '</li>';
        }).join('');

        var conHtml = hyp.contradictedBy.map(function (c) {
          return '<li class="evidence-item contradicts"><span>[-] CONTRADICTS:</span> ' + c + '</li>';
        }).join('');

        var unkHtml = hyp.unknowns.map(function (u) {
          return '<li class="evidence-item unknown"><span>[?] UNKNOWN:</span> ' + u + '</li>';
        }).join('');

        return '<div class="hypothesis-card ' + cardClass + '">' +
          '<div class="hypothesis-header">' +
            '<span class="hypothesis-title">' + hyp.title + '</span>' +
            '<span class="status-badge ' + badgeClass + '">P(' + hyp.probability + ')</span>' +
          '</div>' +
          '<ul class="evidence-list">' + supHtml + conHtml + unkHtml + '</ul>' +
          '<div class="remedy-box"><strong>Recommended Action:</strong> ' + hyp.remedy + '</div>' +
        '</div>';
      }).join('');
    }
  }

  // --- 9. Canvas Plotting Functions ---
  function drawSwrPlot(canvas, sweep, baseline) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width = canvas.parentElement.clientWidth;
    var h = canvas.height = 240;

    ctx.fillStyle = '#0d121c';
    ctx.fillRect(0, 0, w, h);

    if (!sweep || !sweep.valid || !sweep.points) return;

    var padL = 45, padR = 20, padT = 20, padB = 30;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;

    var fMin = sweep.fStartHz;
    var fMax = sweep.fStopHz;
    var swrMax = 5.0;
    var swrMin = 1.0;

    // Grid lines & labels
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '10px system-ui';

    for (var s = 1; s <= 5; s++) {
      var y = padT + plotH - ((s - swrMin) / (swrMax - swrMin)) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillText(s + ':1', 10, y + 3);
    }

    // 2.0 SWR limit line (Yellow dashed)
    var y2 = padT + plotH - ((2.0 - swrMin) / (swrMax - swrMin)) * plotH;
    ctx.save();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, y2);
    ctx.lineTo(w - padR, y2);
    ctx.stroke();
    ctx.restore();

    // Baseline sweep curve (Dashed Muted Cyan)
    if (baseline && baseline.valid && baseline.points) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var b = 0; b < baseline.points.length; b++) {
        var ptB = baseline.points[b];
        var xB = padL + ((ptB.fHz - fMin) / (fMax - fMin)) * plotW;
        var yB = padT + plotH - ((Math.min(ptB.swr, swrMax) - swrMin) / (swrMax - swrMin)) * plotH;
        if (b === 0) ctx.moveTo(xB, yB); else ctx.lineTo(xB, yB);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Active sweep curve (Bold Cyan)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (var i = 0; i < sweep.points.length; i++) {
      var pt = sweep.points[i];
      var x = padL + ((pt.fHz - fMin) / (fMax - fMin)) * plotW;
      var y = padT + plotH - ((Math.min(pt.swr, swrMax) - swrMin) / (swrMax - swrMin)) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Resonance point circle
    var resX = padL + ((sweep.resonanceHz - fMin) / (fMax - fMin)) * plotW;
    var resY = padT + plotH - ((Math.min(sweep.resonanceSwr, swrMax) - swrMin) / (swrMax - swrMin)) * plotH;
    ctx.fillStyle = '#34d399';
    ctx.beginPath();
    ctx.arc(resX, resY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Frequency labels
    ctx.fillStyle = '#94a3b8';
    ctx.fillText((fMin / 1e6).toFixed(3) + ' MHz', padL, h - 10);
    ctx.fillText((sweep.resonanceMhz).toFixed(3) + ' MHz (Min)', resX - 30, h - 10);
    ctx.fillText((fMax / 1e6).toFixed(3) + ' MHz', w - padR - 60, h - 10);
  }

  function drawWaveform(canvas, samples) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width = canvas.parentElement.clientWidth;
    var h = canvas.height = 200;

    ctx.fillStyle = '#0d121c';
    ctx.fillRect(0, 0, w, h);

    // Centerline & clipping limit lines
    var cy = h / 2;
    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(w, cy);
    ctx.stroke();

    var clipYTop = cy - 0.985 * (h * 0.42);
    var clipYBot = cy + 0.985 * (h * 0.42);
    ctx.save();
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.3)';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(0, clipYTop); ctx.lineTo(w, clipYTop);
    ctx.moveTo(0, clipYBot); ctx.lineTo(w, clipYBot);
    ctx.stroke();
    ctx.restore();

    if (!samples || samples.length === 0) return;

    var step = Math.max(1, Math.floor(samples.length / w));
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (var x = 0; x < w; x++) {
      var idx = Math.min(x * step, samples.length - 1);
      var val = samples[idx];
      var y = cy - val * (h * 0.42);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function drawAudioSpectrum(canvas, binFreqs, spectrumDb, humHz) {
    if (!canvas || !binFreqs || !spectrumDb) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width = canvas.parentElement.clientWidth;
    var h = canvas.height = 200;

    ctx.fillStyle = '#0d121c';
    ctx.fillRect(0, 0, w, h);

    var padL = 40, padR = 20, padT = 20, padB = 25;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;

    var fMax = 3000; // Display up to 3000 Hz
    var dbMin = -70;
    var dbMax = 0;

    ctx.strokeStyle = '#1e293b';
    ctx.fillStyle = '#64748b';
    ctx.font = '10px system-ui';

    for (var db = 0; db >= dbMin; db -= 20) {
      var y = padT + ((dbMax - db) / (dbMax - dbMin)) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y); ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillText(db + ' dB', 5, y + 3);
    }

    // Spectrum curve
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2;
    ctx.beginPath();

    var started = false;
    for (var i = 0; i < binFreqs.length; i++) {
      var f = binFreqs[i];
      if (f > fMax) break;
      var x = padL + (f / fMax) * plotW;
      var clampedDb = Math.max(dbMin, Math.min(dbMax, spectrumDb[i]));
      var y2 = padT + ((dbMax - clampedDb) / (dbMax - dbMin)) * plotH;

      if (!started) { ctx.moveTo(x, y2); started = true; }
      else { ctx.lineTo(x, y2); }
    }
    ctx.stroke();

    // Hum marker if present
    if (humHz) {
      var humX = padL + (humHz / fMax) * plotW;
      ctx.save();
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.7)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(humX, padT); ctx.lineTo(humX, h - padB);
      ctx.stroke();
      ctx.fillStyle = '#f87171';
      ctx.fillText(humHz + ' Hz Hum', humX + 4, padT + 12);
      ctx.restore();
    }

    // Labels
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('0 Hz', padL, h - 8);
    ctx.fillText('1000 Hz', padL + (1000 / fMax) * plotW - 15, h - 8);
    ctx.fillText('2000 Hz', padL + (2000 / fMax) * plotW - 15, h - 8);
    ctx.fillText('3000 Hz', w - padR - 35, h - 8);
  }

  function drawRfiPlot(canvas, freqs, baseDb, currDb, diffDb) {
    if (!canvas || !freqs) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width = canvas.parentElement.clientWidth;
    var h = canvas.height = 240;

    ctx.fillStyle = '#0d121c';
    ctx.fillRect(0, 0, w, h);

    var padL = 40, padR = 20, padT = 20, padB = 30;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;

    var fMax = freqs[freqs.length - 1];
    var dbMin = -95, dbMax = -50;

    // Grid
    ctx.strokeStyle = '#1e293b';
    ctx.fillStyle = '#64748b';
    ctx.font = '10px system-ui';

    for (var db = -50; db >= -95; db -= 15) {
      var y = padT + ((dbMax - db) / (dbMax - dbMin)) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y); ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillText(db + ' dBm', 5, y + 3);
    }

    // Baseline (Grey dashed)
    ctx.save();
    ctx.strokeStyle = '#64748b';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (var i = 0; i < freqs.length; i++) {
      var x = padL + (freqs[i] / fMax) * plotW;
      var yB = padT + ((dbMax - baseDb[i]) / (dbMax - dbMin)) * plotH;
      if (i === 0) ctx.moveTo(x, yB); else ctx.lineTo(x, yB);
    }
    ctx.stroke();
    ctx.restore();

    // Device ON (Orange/Red)
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var j = 0; j < freqs.length; j++) {
      var x2 = padL + (freqs[j] / fMax) * plotW;
      var yC = padT + ((dbMax - currDb[j]) / (dbMax - dbMin)) * plotH;
      if (j === 0) ctx.moveTo(x2, yC); else ctx.lineTo(x2, yC);
    }
    ctx.stroke();

    // Legend
    ctx.fillStyle = '#64748b';
    ctx.fillText('-- Baseline (Device OFF)', padL + 10, padT + 12);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('— Active (Device ON)', padL + 150, padT + 12);
  }

  function drawDtHistogram(canvas, dtValues, mean, std) {
    if (!canvas || !dtValues) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width = canvas.parentElement.clientWidth;
    var h = canvas.height = 200;

    ctx.fillStyle = '#0d121c';
    ctx.fillRect(0, 0, w, h);

    var padL = 40, padR = 20, padT = 20, padB = 30;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;

    var dtMin = -2.5, dtMax = 2.5;

    // Zero center line
    var zeroX = padL + ((0 - dtMin) / (dtMax - dtMin)) * plotW;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.beginPath();
    ctx.moveTo(zeroX, padT); ctx.lineTo(zeroX, h - padB);
    ctx.stroke();

    // Binning into 25 bins
    var numBins = 25;
    var binCounts = new Array(numBins).fill(0);
    var binStep = (dtMax - dtMin) / numBins;

    for (var i = 0; i < dtValues.length; i++) {
      var v = dtValues[i];
      var bIdx = Math.floor((v - dtMin) / binStep);
      if (bIdx >= 0 && bIdx < numBins) binCounts[bIdx]++;
    }

    var maxCount = Math.max.apply(null, binCounts) || 1;
    var barW = plotW / numBins;

    ctx.fillStyle = '#818cf8';
    for (var b = 0; b < numBins; b++) {
      var count = binCounts[b];
      var barH = (count / maxCount) * (plotH - 10);
      var bx = padL + b * barW;
      var by = padT + plotH - barH;
      ctx.fillRect(bx + 1, by, barW - 2, barH);
    }

    // Mean indicator
    var meanX = padL + ((mean - dtMin) / (dtMax - dtMin)) * plotW;
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(meanX, padT); ctx.lineTo(meanX, h - padB);
    ctx.stroke();

    ctx.fillStyle = '#f87171';
    ctx.font = '10px system-ui';
    ctx.fillText('Mean: ' + (mean >= 0 ? '+' : '') + mean.toFixed(2) + 's', meanX + 4, padT + 12);

    ctx.fillStyle = '#94a3b8';
    ctx.fillText('-2.0s', padL + ((-2.0 - dtMin) / (dtMax - dtMin)) * plotW - 10, h - 10);
    ctx.fillText('0.0s (NTP)', zeroX - 18, h - 10);
    ctx.fillText('+2.0s', padL + ((2.0 - dtMin) / (dtMax - dtMin)) * plotW - 10, h - 10);
  }

  function redrawCurrentCharts() {
    drawSwrPlot(canvasSwr, state.antenna.sweep, state.antenna.baselineSweep);
    if (state.audio.analysis) {
      drawWaveform(canvasWaveform, state.audio.samples);
      drawAudioSpectrum(canvasAudioSpectrum, state.audio.analysis.binFreqs, state.audio.analysis.spectrumDb, state.audio.analysis.dominantHumHz);
    }
    if (state.rfi.analysis) {
      drawRfiPlot(canvasRfi, state.rfi.analysis.freqs, state.rfi.analysis.baseDb, state.rfi.analysis.currDb, state.rfi.analysis.diffDb);
    }
    if (state.timing.analysis) {
      drawDtHistogram(canvasDt, state.timing.dtList, state.timing.analysis.meanDt, state.timing.analysis.stdDt);
    }
  }

  window.addEventListener('resize', redrawCurrentCharts);

  // --- 10. Report Exporter (Markdown & JSON) ---
  var btnExportMd = document.getElementById('btn-export-md');
  var btnExportJson = document.getElementById('btn-export-json');
  var btnCopyReport = document.getElementById('btn-copy-report');
  var reportOutput = document.getElementById('report-text-area');

  function generateMarkdownReport() {
    var dateStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    var md = [];
    md.push('# Ham Radio Doctor - Forensic Diagnostic Report');
    md.push('*Generated on: ' + dateStr + ' UTC by Ham Radio Doctor v2.0.0*');
    md.push('');
    md.push('## 1. Executive Summary & Evidence Ladder');
    if (state.ladder && state.ladder.hypotheses.length > 0) {
      var top = state.ladder.hypotheses[0];
      md.push('**Primary Finding:** `' + top.title + '` (' + top.probability + ' Confidence)');
      md.push('**Recommended Action:** ' + top.remedy);
      md.push('');
      md.push('### Evidence Summary:');
      state.ladder.evidencePool.forEach(function (e) {
        md.push('- [' + e.level + '] (' + e.category + ') ' + e.text);
      });
    }

    md.push('');
    md.push('## 2. RF & Antenna Diagnostics');
    if (state.rf.calc) {
      md.push('- Forward Power: ' + state.rf.pf + ' W');
      md.push('- Reflected Power: ' + state.rf.pr + ' W');
      md.push('- SWR: ' + state.rf.calc.swr.toFixed(2) + ':1');
      md.push('- Return Loss: ' + (state.rf.calc.returnLossDb === Infinity ? '>40' : state.rf.calc.returnLossDb.toFixed(1)) + ' dB');
      md.push('- Mismatch Loss: ' + state.rf.calc.mismatchLossDb.toFixed(2) + ' dB');
    }
    if (state.antenna.sweep) {
      md.push('- Antenna Preset: ' + state.antenna.preset);
      md.push('- Resonance Frequency: ' + state.antenna.sweep.resonanceMhz.toFixed(3) + ' MHz');
      md.push('- Resonance SWR: ' + state.antenna.sweep.resonanceSwr.toFixed(2));
      if (state.antenna.comparison) {
        md.push('- Shift vs Baseline: ' + state.antenna.comparison.shiftKhz.toFixed(1) + ' kHz');
      }
    }

    md.push('');
    md.push('## 3. Audio & Modulation Diagnostics');
    if (state.audio.analysis) {
      md.push('- Preset: ' + state.audio.preset);
      md.push('- Peak: ' + state.audio.analysis.peakLevel.toFixed(3) + ' | RMS: ' + state.audio.analysis.rmsLevel.toFixed(3));
      md.push('- Digital Clipping: ' + state.audio.analysis.clippingPercent.toFixed(1) + '% samples');
      md.push('- DC Offset: ' + state.audio.analysis.dcOffset.toFixed(3) + ' V');
      md.push('- Hum Detection: ' + (state.audio.analysis.humDetected ? state.audio.analysis.dominantHumHz + ' Hz (+' + state.audio.analysis.humProminenceDb.toFixed(1) + ' dB)' : 'None'));
    }

    md.push('');
    md.push('## 4. Digital Timing & PPM');
    if (state.timing.analysis) {
      md.push('- WSJT-X Mean DT: ' + state.timing.analysis.meanDt.toFixed(2) + ' s (Std: ' + state.timing.analysis.stdDt.toFixed(2) + ' s)');
      md.push('- Status: ' + state.timing.analysis.status);
    }
    if (state.ppm.calc) {
      md.push('- Frequency Offset: ' + state.ppm.calc.deltaHz.toFixed(1) + ' Hz (' + state.ppm.calc.ppm.toFixed(2) + ' PPM)');
    }

    md.push('');
    md.push('## 5. Station Configuration Changes (vs Last Known Good)');
    if (state.stationDiff.diff) {
      if (state.stationDiff.diff.changesCount === 0) {
        md.push('No configuration differences detected.');
      } else {
        state.stationDiff.diff.diffs.forEach(function (d) {
          md.push('- **' + d.label + '**: `' + d.oldValue + '` → `' + d.newValue + '` (' + d.significance + ')');
        });
      }
    }

    return md.join('\n');
  }

  function updateReportDisplay() {
    if (reportOutput) {
      reportOutput.value = generateMarkdownReport();
    }
  }

  if (btnExportMd) {
    btnExportMd.addEventListener('click', function () {
      updateReportDisplay();
      var blob = new Blob([reportOutput.value], { type: 'text/markdown;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'ham-radio-doctor-report.md';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  if (btnExportJson) {
    btnExportJson.addEventListener('click', function () {
      var jsonStr = JSON.stringify(state, null, 2);
      var blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'ham-radio-doctor-session.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  if (btnCopyReport) {
    btnCopyReport.addEventListener('click', function () {
      updateReportDisplay();
      navigator.clipboard.writeText(reportOutput.value).then(function () {
        var orig = btnCopyReport.textContent;
        btnCopyReport.textContent = '✓ Copied!';
        setTimeout(function () { btnCopyReport.textContent = orig; }, 1800);
      });
    });
  }

  // Hook tab switches to update report
  var reportTabBtn = document.querySelector('[data-tab="report"]');
  if (reportTabBtn) {
    reportTabBtn.addEventListener('click', updateReportDisplay);
  }

  // --- Initial Activation ---
  updateRfState();
  updateAntennaSweep();
  updateAudioDoctor();
  updateRfiLab();
  updateDigitalTiming();
  updateStationDiff();
  updateReportDisplay();
});
