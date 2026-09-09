import os
import sys
import math
import random
from pathlib import Path
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from data.hotspots_seed import HOTSPOTS_SEED_DATA

MODEL_PATH = BASE_DIR / "data" / "risk_model.joblib"


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in km between two lat/lng coordinates."""
    r = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2.0) ** 2
    )
    return r * 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def min_dist_to_hotspots(lat: float, lng: float) -> float:
    """Find minimum distance in km from (lat, lng) to any known hotspot."""
    return min(haversine_km(lat, lng, h["lat"], h["lng"]) for h in HOTSPOTS_SEED_DATA)


def build_training_dataset():
    """
    Generate balanced dataset:
    - Positive class (1): Known flood hotspots under moderate to severe rain.
    - Negative class (0): Synthetic points >2km from any hotspot on higher elevation.
    Feature vector: [elevation, rainfall_intensity, rainfall_duration, distance_to_nearest_hotspot]
    """
    random.seed(42)
    np.random.seed(42)

    features = []
    labels = []

    # 1. Generate Positive Examples from the 25 Hotspots
    intensities_pos = [25, 35, 45, 55, 65, 75, 85, 95]
    durations_pos = [30, 45, 60, 90, 120]

    for h in HOTSPOTS_SEED_DATA:
        base_elev = h.get("elevation", 500.0) or 500.0
        for intensity in intensities_pos:
            for dur in durations_pos:
                # Add slight noise to simulate micro-variations around hotspot
                elev = base_elev + random.uniform(-2.0, 2.0)
                dist = random.uniform(0.0, 0.35)  # Within 350m of hotspot
                features.append([elev, intensity, dur, dist])
                labels.append(1)

    # 2. Generate Negative Examples (> 2.0 km from all hotspots, higher terrain)
    neg_coords = []
    attempts = 0
    while len(neg_coords) < 30 and attempts < 1000:
        attempts += 1
        cand_lat = random.uniform(17.30, 17.52)
        cand_lng = random.uniform(78.30, 78.58)
        dist = min_dist_to_hotspots(cand_lat, cand_lng)
        if dist >= 2.0:
            neg_coords.append((cand_lat, cand_lng, dist))

    intensities_neg = [10, 20, 30, 40, 50, 65, 80]
    durations_neg = [20, 30, 45, 60, 90]

    for lat, lng, dist in neg_coords:
        # High ground in Hyderabad: 540m - 610m
        elev = random.uniform(545.0, 610.0)
        for intensity in intensities_neg:
            for dur in durations_neg:
                # High elevation + far from drainage bottleneck = resilient to waterlogging
                features.append([elev + random.uniform(-3.0, 3.0), intensity, dur, dist + random.uniform(-0.2, 0.2)])
                labels.append(0)

    X = np.array(features, dtype=float)
    y = np.array(labels, dtype=int)
    return X, y


def train_and_save_model():
    print(f"Generating training dataset from 25 Hyderabad hotspots & synthetic controls...")
    X, y = build_training_dataset()
    print(f"Total training samples: {len(X)} (Positives: {np.sum(y == 1)}, Negatives: {np.sum(y == 0)})")

    clf = RandomForestClassifier(
        n_estimators=100,
        max_depth=6,
        min_samples_split=4,
        random_state=42,
    )
    clf.fit(X, y)

    # In-sample evaluation
    y_pred = clf.predict(X)
    print("\nModel Training Report:")
    print(classification_report(y, y_pred, target_names=["Low Risk (0)", "High Risk (1)"]))

    print(f"Feature Importances:")
    feature_names = ["Elevation", "Rainfall Intensity", "Duration", "Distance to Hotspot"]
    for name, imp in zip(feature_names, clf.feature_importances_):
        print(f" - {name}: {imp:.4f}")

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(clf, MODEL_PATH)
    print(f"\nModel successfully trained and saved to: {MODEL_PATH}")


if __name__ == "__main__":
    train_and_save_model()
