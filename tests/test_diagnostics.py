import pytest
import numpy as np
import math
from ham_radio_doctor.diagnostics.rf import (
    calculate_swr,
    calculate_return_loss,
    calculate_mismatch_loss,
    analyze_power_readings,
)
from ham_radio_doctor.diagnostics.digital import (
    analyze_wsjtx_timing,
    calculate_ppm_error,
)
from ham_radio_doctor.core.station import (
    StationSnapshot,
    Rig,
    AudioInterface,
    Computer,
)
from ham_radio_doctor.core.session import (
    DiagnosticSession,
    Evidence,
    EvidenceLevel,
    Hypothesis,
    Finding,
)
from ham_radio_doctor.adapters.adif import parse_adif
from ham_radio_doctor.diagnostics.interference import (
    differential_spectrum,
    detect_comb,
)
from ham_radio_doctor.diagnostics.antenna import compare_antenna_baselines


class TestRFDiagnostics:
    def test_perfect_match(self):
        # Pf = 100W, Pr = 0W -> SWR = 1.0
        swr = calculate_swr(100.0, 0.0)
        assert swr == pytest.approx(1.0, rel=1e-3)

    def test_swr_3_to_1(self):
        # For SWR = 3.0: Gamma = (3 - 1) / (3 + 1) = 0.5. Pr/Pf = 0.25
        swr = calculate_swr(100.0, 25.0)
        assert swr == pytest.approx(3.0, rel=1e-3)

    def test_total_reflection(self):
        # Pf = 100W, Pr = 100W -> SWR = inf
        swr = calculate_swr(100.0, 100.0)
        assert math.isinf(swr)

    def test_invalid_readings(self):
        # Pf <= 0
        assert calculate_swr(0.0, 10.0) is None
        assert calculate_swr(-10.0, 5.0) is None
        # Pr > Pf
        assert calculate_swr(50.0, 60.0) is None

    def test_return_loss(self):
        # Pf = 100, Pr = 10 -> RL = -10*log10(0.1) = 10 dB
        rl = calculate_return_loss(100.0, 10.0)
        assert rl == pytest.approx(10.0, rel=1e-3)
        assert calculate_return_loss(100.0, 0.0) is None

    def test_mismatch_loss(self):
        # Pf = 100, Pr = 25 -> Lm = -10*log10(1 - 0.25) = -10*log10(0.75) ~ 1.249 dB
        ml = calculate_mismatch_loss(100.0, 25.0)
        assert ml == pytest.approx(1.249, abs=0.01)

    def test_power_readings_discrepancy(self):
        result = analyze_power_readings(requested_w=100.0, reported_pf=40.0, external_pf=42.0)
        assert len(result["findings"]) > 0
        assert "Rig reports significantly less" in result["findings"][0]


class TestDigitalDiagnostics:
    def test_wsjtx_timing_normal(self):
        dt_values = [0.05, 0.08, -0.02, 0.01, 0.04]
        res = analyze_wsjtx_timing(dt_values)
        assert res["count"] == 5
        assert len(res["findings"]) == 0
        assert abs(res["mean_dt"]) < 0.1

    def test_wsjtx_timing_clock_drift(self):
        # Systematic offset of ~1.8 seconds
        dt_values = [1.81, 1.79, 1.84, 1.80, 1.82]
        res = analyze_wsjtx_timing(dt_values)
        assert res["mean_dt"] == pytest.approx(1.812, abs=0.05)
        assert any("Systematic DT shift" in f for f in res["findings"])

    def test_wsjtx_timing_empty(self):
        res = analyze_wsjtx_timing([])
        assert "error" in res

    def test_calculate_ppm_error(self):
        # Measured 10000020 Hz vs Reference 10000000 Hz -> +2 PPM
        ppm = calculate_ppm_error(10000020.0, 10000000.0)
        assert ppm == pytest.approx(2.0, rel=1e-3)

        with pytest.raises(ValueError):
            calculate_ppm_error(1000.0, 0.0)


class TestStationSnapshotDiff:
    def test_diff_identifies_audio_and_rig_changes(self):
        base = StationSnapshot(
            version="v1",
            description="Last Known Good",
            rig=Rig(model="IC-7300"),
            audio_tx=AudioInterface(device_name="USB Audio CODEC", sample_rate=48000),
            antenna="40m Dipole",
        )
        curr = StationSnapshot(
            version="v2",
            description="Current",
            rig=Rig(model="IC-7300"),
            audio_tx=AudioInterface(device_name="Realtek High Definition", sample_rate=44100),
            antenna="20m Yagi",
        )
        diffs = curr.diff(base)
        assert "audio_tx" in diffs
        assert "antenna" in diffs
        assert "rig" not in diffs


class TestAntennaBaselineComparison:
    def test_compare_antenna_baselines(self):
        base = {"resonance_hz": 7100000.0, "resonance_swr": 1.15}
        curr = {"resonance_hz": 7020000.0, "resonance_swr": 1.85}
        comp = compare_antenna_baselines(base, curr)
        assert comp["resonance_shift_hz"] == -80000.0
        assert comp["swr_change"] == pytest.approx(0.70, abs=1e-3)
        assert len(comp["findings"]) == 2


class TestDiagnosticSession:
    def test_session_lifecycle(self):
        session = DiagnosticSession(id="test-session-001", symptom="High SWR")
        session.add_evidence(
            Evidence(
                description="SWR measured at 7.1 MHz",
                level=EvidenceLevel.OBSERVED,
                value=3.2,
                units=":1",
            )
        )
        session.add_finding(
            Finding(
                title="Excessive SWR",
                description="SWR exceeds transmitter safe limit (2.0:1)",
                severity="WARNING",
            )
        )
        hyp = Hypothesis(description="Antenna detuned by weather")
        session.add_hypothesis(hyp)

        summary = session.analyze()
        assert summary["evidence_count"] == 1
        assert summary["findings_count"] == 1
        assert summary["hypotheses_count"] == 1


class TestADIFParser:
    def test_parse_simple_adif(self, tmp_path):
        adif_file = tmp_path / "test.adi"
        adif_file.write_text(
            "Ham Radio Doctor Test Log\n<EOH>\n"
            "<CALL:4>LU1A<BAND:3>40M<MODE:3>FT8<RST_SENT:3>-08<RST_RCVD:3>-12<EOR>\n"
            "<CALL:6>CE3ABC<BAND:3>20M<MODE:3>SSB<RST_SENT:2>59<RST_RCVD:2>59<EOR>\n",
            encoding="utf-8",
        )
        records = parse_adif(str(adif_file))
        assert len(records) == 2
        assert records[0].get("CALL") == "LU1A"
        assert records[0].get("BAND") == "40M"
        assert records[0].get("MODE") == "FT8"
        assert records[1].get("CALL") == "CE3ABC"
        assert records[1].get("MODE") == "SSB"
