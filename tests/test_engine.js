/**
 * test_engine.js - Test suite for HamDoctorEngine
 */

const assert = require('assert');
const HamDoctorEngine = require('../js/ham-doctor-engine.js');

console.log('--- RUNNING HAM DOCTOR ENGINE TESTS ---');

// Test 1: SWR Calculations
{
  const perfect = HamDoctorEngine.calculateSWR(100, 0);
  assert.strictEqual(perfect.valid, true);
  assert.strictEqual(perfect.swr, 1);
  assert.strictEqual(perfect.returnLossDb, Infinity);
  assert.strictEqual(perfect.mismatchLossDb, 0);
  assert.strictEqual(perfect.status, 'EXCELLENT');

  const swr3 = HamDoctorEngine.calculateSWR(100, 25);
  assert.strictEqual(swr3.valid, true);
  assert.strictEqual(Math.round(swr3.swr), 3);
  assert.strictEqual(swr3.status, 'WARNING');

  const invalidPf = HamDoctorEngine.calculateSWR(0, 10);
  assert.strictEqual(invalidPf.valid, false);

  const invalidPr = HamDoctorEngine.calculateSWR(50, 60);
  assert.strictEqual(invalidPr.valid, false);

  console.log('✓ SWR Calculations passed.');
}

// Test 2: Touchstone Generation & Parsing
{
  const s1pText = HamDoctorEngine.generateAntennaSweep('dipole_40m');
  assert.strictEqual(typeof s1pText, 'string');
  assert(s1pText.includes('# HZ S MA R 50'));

  const parsed = HamDoctorEngine.parseTouchstone(s1pText);
  assert.strictEqual(parsed.valid, true);
  assert.strictEqual(parsed.pointsCount, 81);
  assert(Math.abs(parsed.resonanceMhz - 7.100) < 0.05);
  assert(parsed.resonanceSwr < 1.3);
  assert(parsed.bandwidth2SwrKhz > 100);

  // Rain detuned comparison
  const rainText = HamDoctorEngine.generateAntennaSweep('rain_detuned_40m');
  const rainParsed = HamDoctorEngine.parseTouchstone(rainText);
  assert(rainParsed.resonanceHz < parsed.resonanceHz); // Shifted down

  const comparison = HamDoctorEngine.compareAntennaBaselines(parsed, rainParsed);
  assert.strictEqual(comparison.valid, true);
  assert(comparison.shiftKhz < -50);
  assert(comparison.findings.length > 0);

  console.log('✓ Touchstone & Antenna Sweeps passed.');
}

// Test 3: Audio & ALC Clipping / Hum Analysis
{
  const cleanGen = HamDoctorEngine.generateAudioSamples('clean', 12000, 0.2);
  const cleanRes = HamDoctorEngine.analyzeAudioSamples(cleanGen.samples, 12000);
  assert.strictEqual(cleanRes.valid, true);
  assert.strictEqual(cleanRes.clippingPercent, 0);
  assert.strictEqual(cleanRes.humDetected, false);

  const overGen = HamDoctorEngine.generateAudioSamples('overdrive', 12000, 0.2);
  const overRes = HamDoctorEngine.analyzeAudioSamples(overGen.samples, 12000);
  assert.strictEqual(overRes.valid, true);
  assert(overRes.clippingPercent > 4.0);
  assert(overRes.findings.length > 0);

  const humGen = HamDoctorEngine.generateAudioSamples('hum_50hz', 12000, 0.4);
  const humRes = HamDoctorEngine.analyzeAudioSamples(humGen.samples, 12000);
  assert.strictEqual(humRes.valid, true);
  assert.strictEqual(humRes.humDetected, true);
  assert.strictEqual(humRes.dominantHumHz, 50.0);

  console.log('✓ Audio & ALC Doctor passed.');
}

// Test 4: RFI A/B Lab
{
  const rfiClean = HamDoctorEngine.analyzeDifferentialRFI('clean_no_rfi');
  assert.strictEqual(rfiClean.valid, true);
  assert.strictEqual(rfiClean.combDetected, false);

  const rfiSmps = HamDoctorEngine.analyzeDifferentialRFI('smps_charger');
  assert.strictEqual(rfiSmps.valid, true);
  assert.strictEqual(rfiSmps.combDetected, true);
  assert(rfiSmps.meanIncreaseDb > 3.0);

  console.log('✓ RFI A/B Lab passed.');
}

// Test 5: Digital Timing & PPM
{
  const timingNormal = HamDoctorEngine.analyzeWSJTXTiming([0.02, -0.05, 0.08, 0.01, -0.01]);
  assert.strictEqual(timingNormal.valid, true);
  assert.strictEqual(timingNormal.status, 'NORMAL');

  const timingDrift = HamDoctorEngine.analyzeWSJTXTiming([1.78, 1.82, 1.80, 1.79, 1.81]);
  assert.strictEqual(timingDrift.valid, true);
  assert.strictEqual(timingDrift.status, 'CLOCK_DRIFT');

  const ppm = HamDoctorEngine.calculatePPM(10000030, 10000000);
  assert.strictEqual(ppm.valid, true);
  assert.strictEqual(Math.round(ppm.ppm), 3);

  console.log('✓ Digital Timing & PPM passed.');
}

// Test 6: Station Diff
{
  const baseStation = {
    rigModel: 'IC-7300',
    audioTxDevice: 'USB Audio CODEC',
    antenna: '40m Dipole',
    clockSynced: 'true'
  };
  const currStation = {
    rigModel: 'IC-7300',
    audioTxDevice: 'Microphone Array (Realtek)',
    antenna: '40m Dipole',
    clockSynced: 'true'
  };

  const diff = HamDoctorEngine.diffStationSnapshots(baseStation, currStation);
  assert.strictEqual(diff.valid, true);
  assert.strictEqual(diff.changesCount, 1);
  assert.strictEqual(diff.diffs[0].key, 'audioTxDevice');
  assert(diff.diffs[0].significance.includes('CRITICAL'));

  console.log('✓ Station Diff passed.');
}

// Test 7: Evidence Ladder Integration
{
  const sessionData = {
    rf: HamDoctorEngine.calculateSWR(100, 2),
    audio: HamDoctorEngine.analyzeAudioSamples(
      HamDoctorEngine.generateAudioSamples('overdrive', 12000, 0.2).samples,
      12000
    ),
    timing: HamDoctorEngine.analyzeWSJTXTiming([0.05, 0.02, -0.01]),
    diff: HamDoctorEngine.diffStationSnapshots(
      { audioTxDevice: 'USB CODEC' },
      { audioTxDevice: 'Microphone Array' }
    )
  };

  const ladder = HamDoctorEngine.runEvidenceLadder(sessionData);
  assert.strictEqual(ladder.valid, true);
  assert(ladder.evidencePool.length >= 4);
  assert(ladder.hypotheses.length >= 3);
  assert.strictEqual(ladder.hypotheses[0].title.includes('TX Audio Overdrive'), true);
  assert.strictEqual(ladder.hypotheses[0].probability, 'HIGH');

  console.log('✓ Evidence Ladder passed.');
}

console.log('\nALL 7 ENGINE TESTS PASSED SUCCESSFULLY!');
