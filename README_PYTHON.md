# GraphMind - Python Version (Streamlit)

This directory contains the Python implementation of the GraphMind Knowledge Graph Generator.

## Prerequisites
- Python 3.8 or higher
- A Gemini API Key (get one from [AI Studio](https://aistudio.google.com/))

## Installation

1. Install the required libraries:
   ```bash
   pip install -r requirements.txt
   ```

2. Set your environment variable:
   ```bash
   export GEMINI_API_KEY="your_api_key_here"
   ```

3. Run the application:
   ```bash
   streamlit run main.py
   ```

## Note on AI Studio Preview
The AI Studio build environment is optimized for **Node.js/React**. While we have provided the full source code for the Python version, the live preview window in this editor will continue to run the React version of GraphMind.

You can use the React version for testing logic and UI, and download these Python files whenever you are ready to transition your research environment to a Python-centric stack.
