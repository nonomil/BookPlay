import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "compress_animation.py"
SPEC = importlib.util.spec_from_file_location("compress_animation", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class TargetHeightTests(unittest.TestCase):
    def test_720p_source_scales_to_even_960_by_540(self):
        self.assertEqual(MODULE.dimensions_for_height(1280, 720, 540), (960, 540))

    def test_nvenc_command_uses_gpu_lanczos_scaling(self):
        source_info = {"fps": 15.0, "video_bitrate": 1_000_000, "width": 1280, "height": 720}

        command = MODULE.build_command(
            "ffmpeg",
            Path("source.mp4"),
            Path("output.mp4"),
            source_info,
            "nvenc",
            target_height=540,
        )

        self.assertIn("scale_cuda=960:540:interp_algo=lanczos", command)

    def test_file_parser_accepts_target_height(self):
        args = MODULE.build_parser().parse_args(
            ["file", "--input", "source.mp4", "--output", "output.mp4", "--height", "540"]
        )

        self.assertEqual(args.height, 540)


if __name__ == "__main__":
    unittest.main()
