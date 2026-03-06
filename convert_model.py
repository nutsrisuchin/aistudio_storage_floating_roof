import sys
import os

def convert_model(input_path, output_path):
    ext = os.path.splitext(input_path)[1].lower()
    
    if ext in ['.pt', '.pth']:
        # Try Ultralytics YOLO export first (most common for object detection .pt files)
        try:
            from ultralytics import YOLO
            import shutil
            
            print(f"Attempting conversion with Ultralytics YOLO...", file=sys.stderr)
            
            # Load model
            model = YOLO(input_path)
            
            # Export to ONNX
            # This usually saves the file in the same directory as input with .onnx extension
            # Using opset=12 for better compatibility with onnxruntime-web
            exported_path = model.export(format='onnx', opset=12)
            
            # If export returned a path (it should), move it to the requested output_path
            if exported_path:
                # exported_path might be a list or string
                if isinstance(exported_path, list):
                     exported_path = exported_path[0]
                
                exported_path = str(exported_path)
                
                # Check if the exported file exists
                if not os.path.exists(exported_path):
                    # Sometimes it returns a relative path, try to resolve it
                    if os.path.exists(os.path.join(os.getcwd(), exported_path)):
                        exported_path = os.path.join(os.getcwd(), exported_path)
                    # Sometimes it saves as 'best.onnx' if input was 'best.pt'
                    elif os.path.exists(os.path.splitext(input_path)[0] + '.onnx'):
                         exported_path = os.path.splitext(input_path)[0] + '.onnx'
                    else:
                        print(f"Warning: Exported file not found at {exported_path}", file=sys.stderr)

                if os.path.exists(exported_path) and os.path.abspath(exported_path) != os.path.abspath(output_path):
                    # If output path exists (from previous run?), remove it first
                    if os.path.exists(output_path):
                        os.remove(output_path)
                    shutil.move(exported_path, output_path)
                    
                if os.path.exists(output_path):
                    # Verify the output model
                    try:
                        import onnx
                        onnx_model = onnx.load(output_path)
                        onnx.checker.check_model(onnx_model)
                        print(f"Model converted and verified successfully with Ultralytics to {output_path}")
                    except Exception as e:
                         print(f"Warning: Generated ONNX file verification failed: {e}", file=sys.stderr)
                         # We still return success as sometimes checker is too strict, but warn user
                    return
                else:
                     print(f"Error: Failed to move exported file to {output_path}", file=sys.stderr)
                     # Fall through to generic pytorch if move failed (unlikely but safe)
                
        except Exception as e:
            print(f"Ultralytics conversion failed, falling back to generic PyTorch: {e}", file=sys.stderr)
            # Fallthrough to generic PyTorch conversion below

        try:
            import torch
            import onnx
            
            # Load the model
            # Note: This only works for full model checkpoints, not state_dicts
            model = torch.load(input_path)
            
            # Check if it's a state_dict (dict) or a model
            if isinstance(model, dict):
                print("Error: The provided file appears to be a state_dict (weights only). Please provide a full model checkpoint.", file=sys.stderr)
                sys.exit(1)
                
            model.eval()

            # Create dummy input based on model input shape
            # Defaulting to 1, 3, 640, 640 (common for YOLO)
            # For more robustness, we'd need to inspect the model or ask user for input shape
            dummy_input = torch.randn(1, 3, 640, 640)

            # Export to ONNX
            torch.onnx.export(model, dummy_input, output_path, verbose=False)
            print(f"Model converted successfully to {output_path}")
            
        except ImportError:
            print("Error: torch or onnx not installed.", file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(f"PyTorch conversion error: {e}", file=sys.stderr)
            sys.exit(1)
            
    elif ext == '.tflite':
        try:
            import subprocess
            
            # Use tf2onnx via command line
            # Using opset 13 for broad compatibility
            cmd = [sys.executable, "-m", "tf2onnx.convert", "--tflite", input_path, "--output", output_path, "--opset", "13"]
            
            # Run the command and capture output to avoid polluting stdout unless error
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                raise Exception(f"tf2onnx failed with return code {result.returncode}:\n{result.stderr}")
            
            # Verify the output
            if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
                raise Exception("Conversion produced an empty or missing file.")
                
            # Load and check the model to ensure it's valid ONNX
            try:
                model = onnx.load(output_path)
                onnx.checker.check_model(model)
                print(f"Model converted and verified successfully to {output_path}")
            except Exception as e:
                raise Exception(f"Generated ONNX file is invalid: {e}")
            
        except Exception as e:
            print(f"TFLite conversion error: {e}", file=sys.stderr)
            sys.exit(1)
            
    else:
        print(f"Unsupported file extension: {ext}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python convert_model.py <input_path> <output_path>")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(input_path):
        print(f"Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    convert_model(input_path, output_path)
