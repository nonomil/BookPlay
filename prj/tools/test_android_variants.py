from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2]


def test_gradle_declares_installable_mobile_and_tv_flavors():
    gradle = (ROOT / "android" / "app" / "build.gradle").read_text(encoding="utf-8")
    assert re.search(r"flavorDimensions\s+['\"]device['\"]", gradle)
    assert re.search(r"mobile\s*\{[\s\S]*applicationIdSuffix\s+['\"]\.mobile['\"]", gradle)
    assert re.search(r"tv\s*\{[\s\S]*applicationIdSuffix\s+['\"]\.tv['\"]", gradle)


def test_tv_manifest_declares_leanback_and_landscape_without_touch_requirement():
    manifest_path = ROOT / "android" / "app" / "src" / "tv" / "AndroidManifest.xml"
    manifest = manifest_path.read_text(encoding="utf-8")
    assert 'android.software.leanback' in manifest
    assert 'android.hardware.touchscreen' in manifest
    assert 'android:required="false"' in manifest
    assert 'android:screenOrientation="landscape"' in manifest
    assert 'android.intent.category.LEANBACK_LAUNCHER' in manifest
    assert 'android:banner="@drawable/tv_banner"' in manifest


def test_build_script_names_both_apks():
    script = (ROOT / "scripts" / "build-apks.mjs").read_text(encoding="utf-8")
    assert "assembleMobileDebug" in script
    assert "assembleTvDebug" in script
    assert "storyhall-mobile-debug.apk" in script
    assert "storyhall-tv-debug.apk" in script
