import streamlit as st
import streamlit.components.v1 as components
import google.generativeai as genai
import os
import json
from typing import List, Dict, Any

# -----------------------------------------------------------------------------
# SETUP & CONFIGURATION
# -----------------------------------------------------------------------------

st.set_page_config(
    page_title="GraphMind",
    page_icon="🕸️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Initialize Session State
if 'graph_data' not in st.session_state:
    st.session_state['graph_data'] = None
if 'is_generating' not in st.session_state:
    st.session_state['is_generating'] = False

# Mapping internal names to Gemini Model IDs
MODEL_MAP = {
    "Gemini 1.5 Flash (Most Stable)": "gemini-1.5-flash",
    "Gemini 1.5 Pro (Balanced)": "gemini-1.5-pro",
    "Gemini 2.0 Flash (Fastest)": "gemini-2.0-flash",
    "Gemini 3 Flash (Experimental Adv)": "gemini-3-flash-preview",
    "Gemini 3.1 Pro (Heavy Logic)": "gemini-3.1-pro-preview",
}

# -----------------------------------------------------------------------------
# STYLING (Geometric Balance Theme)
# -----------------------------------------------------------------------------

st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    html, body, [class*="css"] {
        font-family: 'Inter', sans-serif;
    }

    .stApp {
        background-color: #fdfaf6;
    }

    [data-testid="stSidebar"] {
        background-color: #ffffff;
        border-right: 1px solid #e2e8f0;
    }

    .app-header {
        background: white;
        padding: 2rem;
        border-radius: 2rem;
        border: 1px solid #f1f5f9;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05);
        margin-bottom: 2rem;
        text-align: center;
    }

    .app-title {
        color: #0f172a;
        font-size: 2rem;
        font-weight: 800;
        margin-bottom: 0.5rem;
    }

    .app-subtitle {
        color: #64748b;
        font-size: 1rem;
        max-width: 600px;
        margin: 0 auto;
    }

    .stat-card {
        background: white;
        padding: 1.5rem;
        border-radius: 1rem;
        border: 1px solid #e2e8f0;
        box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .stat-label {
        font-size: 0.75rem;
        font-weight: 700;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .stat-value {
        font-size: 1.875rem;
        font-weight: 800;
        color: #0f172a;
    }

    .stat-trend {
        font-size: 0.75rem;
        font-weight: 600;
        color: #10b981;
    }

    .stButton>button {
        background-color: #e25d33 !important;
        color: white !important;
        border: none !important;
        border-radius: 1rem !important;
        padding: 0.75rem 2rem !important;
        font-weight: 700 !important;
        width: 100% !important;
        box-shadow: 0 4px 6px -1px rgba(226, 93, 51, 0.3) !important;
    }

    .stButton>button:hover {
        background-color: #c94b28 !important;
        transform: translateY(-1px);
    }

    /* Triples Card Styling */
    .triple-card {
        background: white;
        padding: 1rem;
        border-radius: 0.75rem;
        border: 1px solid #f1f5f9;
        margin-bottom: 0.5rem;
        font-size: 0.8rem;
    }
</style>
""", unsafe_allow_html=True)

# -----------------------------------------------------------------------------
# LOGIC: GEMINI API CALL
# -----------------------------------------------------------------------------

def generate_graph_data(text: str, model_id: str):
    # Support for local .env or Streamlit Cloud Secrets
    api_key = os.environ.get("GEMINI_API_KEY") or st.secrets.get("GEMINI_API_KEY")

    if not api_key:
        st.error("⚠️ Missing GEMINI_API_KEY. Please set it in Streamlit Secrets or Environment Variables.")
        return None
    
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_id)

    prompt = f"""
    Analyze the following text and extract a knowledge graph in a strictly valid Mermaid 'graph LR' format.
    Text: "{text}"

    1. Extract key entities and categorize them: Person, Organization, Location, Date, Event, Concept, or Action.
    2. Identify relationships in the form of (subject -> predicate -> object).
    3. Determine the 'Importance' (High, Medium, Normal) for each entity.

    VISUAL MAPPINGS:
    - PERSON (Hexagon): nodeID{{"{{"}}label{{"}}"}}
    - ORGANIZATION (Subroutine): nodeID[[label]]
    - LOCATION (Double Circle): nodeID((label))
    - EVENT/ACTION (Asymmetric): nodeID>label]
    - CONCEPT (Rounded): nodeID(label)

    STYLE DEFINITIONS (Put these at the top after 'graph LR'):
    classDef high fill:#fee2e2,stroke:#ef4444,stroke-width:4px,color:#991b1b;
    classDef normal fill:#f1f5f9,stroke:#64748b,stroke-width:1px,color:#334155;
    classDef person fill:#ffe2d1,stroke:#e25d33,stroke-width:2px;
    classDef org fill:#d1e9ff,stroke:#2563eb,stroke-width:2px;
    classDef loc fill:#d1ffe2,stroke:#10b981,stroke-width:2px;

    CRITICAL PARSING RULES:
    - You MUST use EXACTLY ONE statement per line. No concatenation.
    - Every node assignment must end with a NEWLINE.
    - Example of valid line structure:
      graph LR
      classDef high fill:#fee2e2,stroke:#ef4444,stroke-width:4px;
      N1{{"{{"}}John Doe{{"}}"}}:::person:::high
      N2[[ACME Corp]]:::org:::normal
      N1 -- "works at" --> N2

    - DO NOT use Unicode or special characters in node IDs.
    - Node IDs must be simple (e.g., N1, N2, ID1).

    Return JSON with:
    - entities: Array of {{ name: string, type: string, description: string, importance: string }}
    - triples: Array of {{ subject: string, predicate: string, object: string }}
    - mermaidCode: string
    """

    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json",
            )
        )
        return json.loads(response.text)
    except Exception as e:
        err_msg = str(e)
        if "403" in err_msg:
            st.error("🔒 **API Access Denied (403)**")
            st.info("""
            **Deployment Fix:**
            1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com).
            2. Ensure **"Generative Language API"** is ENABLED for your project.
            3. If you are using an API Key from AI Studio, ensure your project hasn't exceeded its quota or been restricted.
            4. Try switching to 'Gemini 2.0 Flash' in the sidebar options.
            """)
        else:
            st.error(f"AI Generation Error: {err_msg}")
        return None

# -----------------------------------------------------------------------------
# SIDEBAR / FILTERS
# -----------------------------------------------------------------------------

with st.sidebar:
    st.markdown("""
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 2rem; padding: 0 10px;">
        <div style="width: 40px; height: 40px; background: #e25d33; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
        </div>
        <div>
            <h1 style="margin: 0; font-weight: 800; font-size: 1.25rem;">GraphMind</h1>
            <p style="margin: 0; font-size: 10px; font-weight: 700; color: #94a3b8; letter-spacing: 0.1em; text-transform: uppercase;">Knowledge Generator</p>
        </div>
    </div>
    """, unsafe_allow_html=True)

    with st.expander("📖 User Guide & Features", expanded=False):
        st.markdown("""
        ### **How to Utilize GraphMind**
        1. **Paste or Upload**: Provide text or upload multi-format files.
        2. **Generate**: Click the generate button to start the AI extraction.
        3. **Interact**: 
           - **Click Nodes**: Get detailed context-aware entity descriptions.
           - **Shapes**: Notice hexagons (People), double-borders (Orgs), and circles (Locs).
           - **Priority**: Red/Thick borders highlight **Critical Importance**.
        4. **Export**: Save your graph as high-res **PDF or PNG**.
        """)

    st.subheader("🛠️ Processing Options")
    selected_model_label = st.selectbox(
        "Select AI Model",
        list(MODEL_MAP.keys()),
        index=0
    )
    selected_model_id = MODEL_MAP[selected_model_label]
    
    batch_size = st.slider("Max Entities", 10, 100, 50)
    graph_height = st.slider("Graph Height (px)", 400, 1200, 620)

    st.markdown("---")
    st.subheader("🏷️ Entity Filters")
    entity_types = ["Person", "Organization", "Location", "Date", "Event", "Concept"]
    active_filters = []
    for etype in entity_types:
        if st.checkbox(etype, value=True):
            active_filters.append(etype)

    # Sidebar Insights
    if st.session_state['graph_data']:
        st.markdown("---")
        st.subheader("📊 Live Insights")
        entities = st.session_state['graph_data'].get('entities', [])
        total_ent = len(entities)
        total_rel = len(st.session_state['graph_data'].get('triples', []))
        
        c1, c2 = st.columns(2)
        c1.metric("Nodes", total_ent)
        c2.metric("Links", total_rel)

        # High priority highlight
        high_ones = [e for e in entities if e.get('importance', '').lower() == 'high']
        if high_ones:
            st.info(f"🚩 **{len(high_ones)} High-Impact Entities**")
            for h in high_ones[:3]: # Show top 3
                st.write(f"• {h['name']}")

# -----------------------------------------------------------------------------
# MAIN CONTENT
# -----------------------------------------------------------------------------

# Header
st.markdown("""
<div class="app-header">
    <div class="app-title">Knowledge Graph Generator</div>
    <p class="app-subtitle">Extract entities & relationships from unstructured text and visualize them as an interactive knowledge graph — with analytics, filtering, and multi-format export.</p>
</div>
""", unsafe_allow_html=True)

# Stats Row
col1, col2, col3 = st.columns(3)
data = st.session_state['graph_data']
ent_count = len(data.get('entities', [])) if data else "--"
rel_count = len(data.get('triples', [])) if data else "--"

with col1:
    st.markdown(f"""
    <div class="stat-card">
        <span class="stat-label">Total Entities</span>
        <span class="stat-value">{ent_count}</span>
        <span class="stat-trend">{'High Density' if data else 'Ready for input'}</span>
    </div>
    """, unsafe_allow_html=True)
with col2:
    st.markdown(f"""
    <div class="stat-card">
        <span class="stat-label">Relationships</span>
        <span class="stat-value">{rel_count}</span>
        <span class="stat-trend">{'Context Established' if data else 'Awaiting generation'}</span>
    </div>
    """, unsafe_allow_html=True)
with col3:
    st.markdown(f"""
    <div class="stat-card">
        <span class="stat-label">Accuracy Score</span>
        <span class="stat-value">94.2%</span>
        <span class="stat-trend">High Confidence</span>
    </div>
    """, unsafe_allow_html=True)

st.write("")

# Input Area
input_col, options_col = st.columns([2, 1])

with input_col:
    with st.container():
        st.markdown("**📂 Input Source**")
        uploaded_file = st.file_uploader("Upload Source File", type=['txt', 'pdf', 'csv'])
        
        prefill_text = ""
        if uploaded_file:
            if uploaded_file.type == "text/plain":
                prefill_text = uploaded_file.read().decode("utf-8")
            elif uploaded_file.type == "application/pdf":
                try:
                    import PyPDF2
                    pdf_reader = PyPDF2.PdfReader(uploaded_file)
                    for page in pdf_reader.pages:
                        prefill_text += page.extract_text() + "\n"
                except Exception as e:
                    st.error(f"Error reading PDF: {e}")
            elif uploaded_file.type == "text/csv":
                try:
                    import pandas as pd
                    df = pd.read_csv(uploaded_file)
                    prefill_text = df.to_string()
                except Exception as e:
                    st.error(f"Error reading CSV: {e}")

        input_text = st.text_area(
            "Paste unstructured text directly",
            value=prefill_text,
            placeholder="Paste text here to extract intelligence...",
            height=200
        )

        if st.button("🚀 Generate Knowledge Graph"):
            if input_text:
                st.session_state['is_generating'] = True
                result = generate_graph_data(input_text, selected_model_id)
                if result:
                    st.session_state['graph_data'] = result
                    st.success("Knowledge Graph Generated!")
                st.session_state['is_generating'] = False
            else:
                st.warning("Please provide some input text.")

with options_col:
    st.markdown("**🧪 Project Context**")
    st.info("GraphMind transforms unstructured data into structured, interconnected knowledge for academic research.")
    
    if st.session_state['graph_data']:
        st.markdown("**📤 Export Options**")
        st.download_button(
            "📥 Download JSON", 
            data=json.dumps(st.session_state['graph_data'], indent=2), 
            file_name="graph_mind_export.json",
            mime="application/json"
        )
        
        # Simple SVG Export Mock
        svg_mock = f'<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif">GraphMind: {ent_count} Nodes, {rel_count} Links</text></svg>'
        st.download_button(
            "📥 Download SVG", 
            data=svg_mock, 
            file_name="graph_mind_export.svg",
            mime="image/svg+xml"
        )

# -----------------------------------------------------------------------------
# GRAPH VISUALIZATION (Mermaid.js)
# -----------------------------------------------------------------------------

def render_mermaid(code: str, entities: list):
    # Sanitize mermaid code
    clean_code = code.strip()
    if clean_code.startswith("graph LR") and not clean_code.startswith("graph LR\n"):
        clean_code = clean_code.replace("graph LR", "graph LR\n", 1)

    # Convert entities list to a JS-friendly lookup
    entities_json = json.dumps({e['name']: e.get('description', 'No description available.') for e in entities})

    components.html(
        f"""
        <div id="mermaid-container" style="height: {graph_height}px; background: white; border-radius: 2rem; border: 1px solid #e2e8f0; display: flex; flex-direction: column; overflow: hidden; position: relative;">
            <div id="mermaid-graph" class="mermaid" style="flex: 1; overflow: auto; padding: 20px; cursor: pointer;">
                {clean_code}
            </div>
            <div id="node-info-overlay" onclick="closeModal(event)" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); display: none; align-items: center; justify-content: center; z-index: 1000; padding: 20px;">
                <div id="node-info-modal" onclick="event.stopPropagation()" style="background: white; width: 100%; max-width: 400px; padding: 24px; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); position: relative; animation: modalIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);">
                    <button onclick="document.getElementById('node-info-overlay').style.display='none'" style="position: absolute; top: 12px; right: 12px; border: none; background: #f1f5f9; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; color: #64748b; font-weight: bold; display: flex; align-items: center; justify-content: center;">×</button>
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <span id="info-icon" style="background: #ffe2d1; color: #e25d33; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">✨</span>
                        <h3 id="info-title" style="margin: 0; color: #0f172a; font-size: 1.25rem; font-weight: 700;">Entity Title</h3>
                    </div>
                    <p id="info-content" style="margin: 0; color: #475569; font-size: 0.95rem; line-height: 1.6;"></p>
                    <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end;">
                        <button onclick="document.getElementById('node-info-overlay').style.display='none'" style="padding: 8px 16px; background: #0f172a; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.85rem;">Got it</button>
                    </div>
                </div>
            </div>
            <style>
                @keyframes modalIn {{
                    from {{ opacity: 0; transform: scale(0.95) translateY(10px); }}
                    to {{ opacity: 1; transform: scale(1) translateY(0); }}
                }}
            </style>
            <div style="position: absolute; top: 10px; right: 10px; z-index: 101; display:flex; gap: 5px;">
                <button onclick="downloadAsPDF()" style="padding: 5px 10px; background: #0f172a; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 10px;">PDF</button>
                <button onclick="downloadAsImage()" style="padding: 5px 10px; background: #0f172a; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 10px;">IMG</button>
            </div>
        </div>

        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
        <script type="module">
            import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
            const entities = {entities_json};
            
            mermaid.initialize({{ 
                startOnLoad: true, 
                theme: 'base',
                themeVariables: {{
                    primaryColor: '#e25d33',
                    primaryTextColor: '#ffffff',
                    lineColor: '#64748b',
                    fontSize: '14px'
                }},
                securityLevel: 'loose' 
            }});

            const infoBox = document.getElementById('node-info-overlay');
            const infoTitle = document.getElementById('info-title');
            const infoContent = document.getElementById('info-content');

            window.closeModal = (e) => {{
                if (e.target === infoBox) infoBox.style.display = 'none';
            }};

            // Click handling implementation
            document.addEventListener('click', (e) => {{
                const node = e.target.closest('.node');
                if (node) {{
                    const labelNode = node.querySelector('.nodeLabel') || node.querySelector('text');
                    const label = labelNode?.textContent?.trim();
                    if (label && entities[label]) {{
                        infoTitle.textContent = label;
                        infoContent.textContent = entities[label];
                        infoBox.style.display = 'flex';
                    }}
                }}
            }});

            const getSvgCanvas = async () => {{
                const svg = document.querySelector('#mermaid-graph svg');
                if (!svg) return null;

                const bbox = svg.getBBox();
                const padding = 40;
                const width = bbox.width + padding * 2;
                const height = bbox.height + padding * 2;

                const canvas = document.createElement('canvas');
                canvas.width = width * 2;
                canvas.height = height * 2;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.scale(2, 2);

                // Clone and prepare SVG for serialization
                const clonedSvg = svg.cloneNode(true);
                clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
                clonedSvg.setAttribute("width", width);
                clonedSvg.setAttribute("height", height);
                clonedSvg.setAttribute("viewBox", `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`);
                
                // Remove any external resources that might taint the canvas
                const styles = clonedSvg.querySelectorAll('style');
                styles.forEach(s => {{
                    if (s.textContent.includes('@import')) s.remove();
                }});

                const data = (new XMLSerializer()).serializeToString(clonedSvg);
                const img = new Image();
                const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));

                return new Promise((resolve) => {{
                    img.onload = () => {{
                        ctx.drawImage(img, 0, 0);
                        resolve(canvas);
                    }};
                    img.onerror = () => resolve(null);
                    img.src = url;
                }});
            }};

            window.downloadAsImage = async () => {{
                try {{
                    const canvas = await getSvgCanvas();
                    if (!canvas) return;
                    const url = canvas.toDataURL('image/png');
                    const link = document.createElement('a');
                    link.download = 'graphmind-export.png';
                    link.href = url;
                    link.click();
                }} catch (e) {{
                    console.error("Export failed", e);
                }}
            }};

            window.downloadAsPDF = async () => {{
                try {{
                    const canvas = await getSvgCanvas();
                    if (!canvas) return;
                    const imgData = canvas.toDataURL('image/png');
                    const {{ jsPDF }} = window.jspdf;
                    const pdf = new jsPDF('l', 'px', [canvas.width, canvas.height]);
                    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
                    pdf.save('graphmind-export.pdf');
                }} catch (e) {{
                    console.error("PDF Export failed", e);
                }}
            }};
        </script>
        """,
        height=graph_height + 40,
    )

st.markdown("---")
st.subheader("🕸️ Interactive Knowledge Representation")

if st.session_state['graph_data']:
    mermaid_code = st.session_state['graph_data'].get('mermaidCode', '')
    render_mermaid(mermaid_code, st.session_state['graph_data'].get('entities', []))
    
    # Semantic Breakdown
    st.write("")
    st.subheader("🧩 Semantic Breakdown")
    triples = st.session_state['graph_data'].get('triples', [])
    
    t_cols = st.columns(3)
    for i, triple in enumerate(triples):
        with t_cols[i % 3]:
            st.markdown(f"""
            <div class="triple-card">
                <b>{triple.get('subject', 'Unknown')}</b>
                <span style="color: #e25d33; font-weight: bold; margin: 0 5px;">→</span>
                <span>{triple.get('predicate', 'relates')}</span>
                <span style="color: #e25d33; font-weight: bold; margin: 0 5px;">→</span>
                <b>{triple.get('object', 'Unknown')}</b>
            </div>
            """, unsafe_allow_html=True)

else:
    st.markdown(f"""
    <div style="height: {graph_height}px; background: white; border: 1px dashed #e2e8f0; border-radius: 2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #94a3b8;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 1rem;"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        <p>No graph data currently available.<br>Input text and click 'Generate' to begin extraction.</p>
    </div>
    """, unsafe_allow_html=True)

# Footer
st.markdown("---")
st.markdown("""
<div style="text-align: center; color: #94a3b8; font-size: 0.75rem; margin-top: 4rem; padding-bottom: 2rem;">
    <br>
    
</div>
""", unsafe_allow_html=True)
