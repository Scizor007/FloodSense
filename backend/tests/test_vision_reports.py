"""
Unit tests for FloodSense Hyderabad Gemini Vision Verification & Report Workflow.
Tests scenarios A, B, C, D, and E as specified in user requirements.
Uses unittest and unittest.mock so no live external services or real API keys are required.
"""

import asyncio
import os
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure backend directory is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from models.report import ReportCreateModel
from routers.reports import create_report, haversine_km
from services.vision import _parse_gemini_json, verify_flood_photo


class MockAsyncCursor:
    """Mock MongoDB async cursor for to_list() calls."""
    def __init__(self, items):
        self.items = items

    async def to_list(self, length=100):
        return list(self.items[:length])


class TestGeminiVisionParsing(unittest.TestCase):
    """Test Gemini JSON parsing and error resilience."""

    def test_clean_json_parsing(self):
        raw = '{"flood_detected": true, "confidence": 0.94, "severity": "high", "explanation": "Submerged road", "image_usable": true}'
        res = _parse_gemini_json(raw)
        self.assertIsNotNone(res)
        self.assertTrue(res["flood_detected"])
        self.assertEqual(res["confidence"], 0.94)

    def test_markdown_code_fenced_json(self):
        raw = '```json\n{"flood_detected": false, "confidence": 0.12, "severity": "low", "explanation": "Dry street", "image_usable": true}\n```'
        res = _parse_gemini_json(raw)
        self.assertIsNotNone(res)
        self.assertFalse(res["flood_detected"])

    def test_malformed_json_returns_none(self):
        raw = "This is not json at all! Error 500"
        res = _parse_gemini_json(raw)
        self.assertIsNone(res)


class TestVisionService(unittest.IsolatedAsyncioTestCase):
    """Test vision service behavior with unconfigured keys and invalid inputs."""

    async def test_scenario_e_no_api_key_configured(self):
        """Scenario E: No GEMINI_API_KEY configured -> returns unconfigured provider, does NOT crash."""
        with patch("services.vision.settings.GEMINI_API_KEY", ""):
            # Valid 1x1 base64 GIF
            valid_gif_base64 = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
            result = await verify_flood_photo(valid_gif_base64)
            self.assertFalse(result["flood_detected"])
            self.assertEqual(result["confidence"], 0.0)
            self.assertEqual(result["provider"], "unconfigured")
            self.assertIn("not configured", result["explanation"].lower())
            self.assertTrue(result["image_usable"])

    async def test_scenario_d_corrupt_image_graceful_handling(self):
        """Scenario D: Corrupt or unreadable image -> handled gracefully without crash."""
        with patch("services.vision.settings.GEMINI_API_KEY", "fake_test_key"):
            corrupt_data = "data:image/jpeg;base64,NotAValidBase64String!!!"
            result = await verify_flood_photo(corrupt_data)
            self.assertFalse(result["flood_detected"])
            self.assertFalse(result["image_usable"])
            self.assertEqual(result["provider"], "error")

    async def test_no_image_provided(self):
        """No image provided -> handled cleanly."""
        result = await verify_flood_photo(None)
        self.assertFalse(result["flood_detected"])
        self.assertFalse(result["image_usable"])
        self.assertEqual(result["provider"], "none")


class TestReportsWorkflow(unittest.IsolatedAsyncioTestCase):
    """Test full report creation workflow covering scenarios A, B, C, D, and E."""

    def setUp(self):
        self.mock_coll = MagicMock()
        self.inserted_doc = None

        async def mock_insert_one(doc):
            from bson import ObjectId
            doc["_id"] = ObjectId()
            self.inserted_doc = doc
            res = MagicMock()
            res.inserted_id = doc["_id"]
            return res

        self.mock_coll.insert_one = AsyncMock(side_effect=mock_insert_one)
        self.mock_coll.update_many = AsyncMock()

    @patch("routers.reports.get_collection")
    @patch("routers.reports.verify_flood_photo")
    async def test_scenario_a_valid_flood_image(self, mock_verify, mock_get_coll):
        """Scenario A: Valid flood image -> Gemini confirms flood -> report stored with ai_verified=True."""
        mock_get_coll.return_value = self.mock_coll
        self.mock_coll.find.return_value = MockAsyncCursor([])  # No existing reports

        mock_verify.return_value = {
            "flood_detected": True,
            "confidence": 0.95,
            "severity": "high",
            "explanation": "Visible standing water submerging roadway lanes.",
            "image_usable": True,
            "provider": "gemini (gemini-2.5-flash)",
        }

        req = ReportCreateModel(
            lat=17.397,
            lng=78.4075,
            severity="knee",
            citizen_reported_depth="Knee-deep",
            note="Tolichowki flyover underpass",
            photo_url="https://example.com/flood1.jpg",
        )

        response = await create_report(req)

        self.assertTrue(response.ai_verified)
        self.assertEqual(response.status, "pending")
        self.assertEqual(response.corroboration_count, 1)
        self.assertEqual(response.ai_confidence, 0.95)
        self.assertEqual(response.citizen_reported_depth, "Knee-deep")
        self.assertIn("Visible standing water", response.ai_explanation)

    @patch("routers.reports.get_collection")
    @patch("routers.reports.verify_flood_photo")
    async def test_scenario_b_non_flood_image_rejected_nearby_reports_cannot_override(
        self, mock_verify, mock_get_coll
    ):
        """
        Scenario B: Non-flood image -> Gemini rejects -> nearby reports CANNOT override rejection.
        Status must remain 'rejected', ai_verified=False, corroboration_count=0.
        """
        mock_get_coll.return_value = self.mock_coll

        from bson import ObjectId
        # 3 existing nearby verified reports in the same location
        nearby_existing = [
            {"_id": ObjectId(), "lat": 17.3971, "lng": 78.4076, "status": "verified"},
            {"_id": ObjectId(), "lat": 17.3972, "lng": 78.4074, "status": "verified"},
            {"_id": ObjectId(), "lat": 17.3969, "lng": 78.4075, "status": "verified"},
        ]
        self.mock_coll.find.return_value = MockAsyncCursor(nearby_existing)

        # Gemini rejects the photo
        mock_verify.return_value = {
            "flood_detected": False,
            "confidence": 0.98,
            "severity": "low",
            "explanation": "Image shows clear dry asphalt with normal traffic.",
            "image_usable": True,
            "provider": "gemini (gemini-2.5-flash)",
        }

        req = ReportCreateModel(
            lat=17.397,
            lng=78.4075,
            severity="ankle",
            citizen_reported_depth="Ankle-deep",
            note="Testing dry street rejection",
            photo_url="https://example.com/dry_road.jpg",
        )

        response = await create_report(req)

        # Strict checks:
        self.assertFalse(response.ai_verified)
        self.assertEqual(response.status, "rejected")
        self.assertEqual(response.corroboration_count, 0)
        # Corroboration must NOT have updated any records
        self.mock_coll.update_many.assert_not_called()

    @patch("routers.reports.get_collection")
    @patch("routers.reports.verify_flood_photo")
    async def test_scenario_c_flood_image_plus_nearby_reports_corroborates(
        self, mock_verify, mock_get_coll
    ):
        """
        Scenario C: Flood image + nearby reports within 300m
        -> corroboration_count increases -> report becomes verified.
        """
        mock_get_coll.return_value = self.mock_coll

        from bson import ObjectId
        # 1 existing report 150m away at Tolichowki
        existing_report = {
            "_id": ObjectId(),
            "lat": 17.398,  # ~110m north
            "lng": 78.4075,
            "status": "pending",
        }
        self.mock_coll.find.return_value = MockAsyncCursor([existing_report])

        mock_verify.return_value = {
            "flood_detected": True,
            "confidence": 0.91,
            "severity": "high",
            "explanation": "Heavy road inundation with stalled scooter.",
            "image_usable": True,
            "provider": "gemini (gemini-2.5-flash)",
        }

        req = ReportCreateModel(
            lat=17.397,
            lng=78.4075,
            severity="knee",
            citizen_reported_depth="Knee-deep",
            note="Tolichowki junction nala overflow",
            photo_url="https://example.com/flood2.jpg",
        )

        response = await create_report(req)

        # Both reports form a cluster of 2 -> promoted to verified!
        self.assertTrue(response.ai_verified)
        self.assertEqual(response.status, "verified")
        self.assertEqual(response.corroboration_count, 2)
        # Verify that the existing report was also promoted to verified
        self.mock_coll.update_many.assert_called_once()

    @patch("routers.reports.get_collection")
    @patch("routers.reports.verify_flood_photo")
    async def test_scenario_d_gemini_api_failure_graceful_fallback(
        self, mock_verify, mock_get_coll
    ):
        """Scenario D: Gemini API failure -> graceful fallback, queued for authority review."""
        mock_get_coll.return_value = self.mock_coll
        self.mock_coll.find.return_value = MockAsyncCursor([])

        mock_verify.return_value = {
            "flood_detected": False,
            "confidence": 0.0,
            "severity": "low",
            "explanation": "AI vision verification temporarily unavailable. Queued for authority review.",
            "image_usable": True,
            "provider": "error",
        }

        req = ReportCreateModel(
            lat=17.3685,
            lng=78.513,
            severity="knee",
            citizen_reported_depth="Knee-deep",
            note="Moosarambagh bridge",
            photo_url="https://example.com/photo.jpg",
        )

        response = await create_report(req)

        self.assertFalse(response.ai_verified)
        self.assertEqual(response.status, "pending")
        self.assertIn("authority review", response.ai_explanation.lower())

    @patch("routers.reports.get_collection")
    @patch("routers.reports.verify_flood_photo")
    async def test_scenario_e_no_api_key_configured_in_report_workflow(
        self, mock_verify, mock_get_coll
    ):
        """Scenario E: No API key configured -> report stored safely as pending without crash."""
        mock_get_coll.return_value = self.mock_coll
        self.mock_coll.find.return_value = MockAsyncCursor([])

        mock_verify.return_value = {
            "flood_detected": False,
            "confidence": 0.0,
            "severity": "low",
            "explanation": "Gemini API key is not configured in backend/.env. Report queued for manual authority review.",
            "image_usable": True,
            "provider": "unconfigured",
        }

        req = ReportCreateModel(
            lat=17.3725,
            lng=78.502,
            severity="impassable",
            citizen_reported_depth="Impassable",
            note="Malakpet subway",
            photo_url="https://example.com/photo.jpg",
        )

        response = await create_report(req)

        self.assertFalse(response.ai_verified)
        self.assertEqual(response.status, "pending")
        self.assertIn("not configured", response.ai_explanation.lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)
