import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  BarChart3, 
  CheckCircle2, 
  Clock, 
  LayoutDashboard, 
  Settings, 
  Users, 
  Plus,
  ArrowUpRight,
  Target,
  FileText,
  Upload,
  Zap,
  Filter,
  Users as PeopleIcon,
  Globe,
  Building2,
  Calendar,
  Share2,
  Download,
  Database,
  Search,
  Maximize2,
  Activity,
  X,
  Info
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import mermaid from "mermaid";
import { GoogleGenAI, Type } from "@google/genai";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

// Initialize Mermaid with custom theme
mermaid.initialize({
  startOnLoad: true,
  theme: 'base',
  themeVariables: {
    primaryColor: '#e25d33',
    primaryTextColor: '#ffffff',
    lineColor: '#64748b',
    fontSize: '14px'
  },
  securityLevel: 'loose',
});

// TYPES
interface Entity {
  name: string;
  type: string;
  description: string;
  importance?: string;
}

interface Triple {
  subject: string;
  predicate: string;
  object: string;
}

interface GraphData {
  entities: Entity[];
  triples: Triple[];
  mermaidCode: string;
}

const ENTITY_TYPES = [
  { label: 'Person', icon: <PeopleIcon size={14} />, color: 'bg-red-500', active: true },
  { label: 'Organization', icon: <Building2 size={14} />, color: 'bg-orange-500', active: true },
  { label: 'Location', icon: <Globe size={14} />, color: 'bg-rose-500', active: true },
  { label: 'Date', icon: <Calendar size={14} />, color: 'bg-red-400', active: true },
  { label: 'Event', icon: <Activity size={14} />, color: 'bg-rose-400', active: true },
  { label: 'Concept', icon: <Database size={14} />, color: 'bg-red-600', active: true },
];

export default function App() {
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [activeFilters, setActiveFilters] = useState<string[]>(ENTITY_TYPES.map(t => t.label));
  const [selectedModel, setSelectedModel] = useState("gemini-3-flash-preview");
  const [batchSize, setBatchSize] = useState(50);
  const [graphHeight, setGraphHeight] = useState(620);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mermaidRef = useRef<HTMLDivElement>(null);

  const getSvgCanvas = async () => {
    if (!mermaidRef.current) return null;
    const svg = mermaidRef.current.querySelector('svg');
    if (!svg) return null;

    // Use getBBox to get the absolute dimensions of the graph content
    const bbox = (svg as unknown as SVGSVGElement).getBBox();
    const padding = 40;
    const width = bbox.width + padding * 2;
    const height = bbox.height + padding * 2;

    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(2, 2);
    }

    // Clone and prepare SVG for serialization
    const clonedSvg = svg.cloneNode(true) as SVGSVGElement;
    clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clonedSvg.setAttribute("width", width.toString());
    clonedSvg.setAttribute("height", height.toString());
    clonedSvg.setAttribute("viewBox", `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`);

    // Remove any external resources that might taint the canvas
    const styles = clonedSvg.querySelectorAll('style');
    styles.forEach(s => {
      if (s.textContent?.includes('@import')) s.remove();
    });

    const data = (new XMLSerializer()).serializeToString(clonedSvg);
    const img = new Image();
    const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));

    return new Promise<HTMLCanvasElement>((resolve) => {
      img.onload = () => {
        ctx?.drawImage(img, 0, 0);
        resolve(canvas);
      };
      img.onerror = () => resolve(canvas); 
      img.src = url;
    });
  };

  const exportAsImage = async () => {
    try {
      const canvas = await getSvgCanvas();
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = 'graphmind-export.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  const exportAsPDF = async () => {
    try {
      const canvas = await getSvgCanvas();
      if (!canvas) return;
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'px', [canvas.width, canvas.height]);
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save('graphmind-export.pdf');
    } catch (err) {
      console.error("PDF export failed:", err);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        setInputText(prev => prev + (prev ? "\n" : "") + text);
      };
      reader.readAsText(file);
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    noClick: false, // Explicitly adding some common properties
    noKeyboard: false
  } as any);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const generateGraph = async () => {
    if (!inputText.trim()) {
      setError("Please provide some text to process.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const prompt = `
        Analyze the following text and extract a knowledge graph in a strictly valid Mermaid 'graph LR' format.
        Text: "${inputText}"

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
        classDef person fill:#ffe2d1,stroke:#e25d33,stroke-width:2px;
        classDef org fill:#d1e9ff,stroke:#2563eb,stroke-width:2px;
        classDef loc fill:#d1ffe2,stroke:#10b981,stroke-width:2px;

        CRITICAL PARSING RULES:
        - You MUST use EXACTLY ONE statement per line. No concatenation.
        - Every node assignment must end with a NEWLINE.
        - Example:
          graph LR
          classDef high fill:#fee2e2,stroke:#ef4444,stroke-width:4px;
          N1{{"{{"}}John Doe{{"}}"}}:::person:::high
          N2[[ACME Corp]]:::org
          N1 -- "works at" --> N2

        - DO NOT use Unicode or special characters in node IDs.
        - Node IDs must be simple (e.g., N1, N2).

        Return JSON with:
        - entities: Array of { name: string, type: string, description: string, importance: string }
        - triples: Array of { subject: string, predicate: string, object: string }
        - mermaidCode: string
      `;

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              entities: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    type: { type: Type.STRING },
                    description: { type: Type.STRING },
                    importance: { type: Type.STRING }
                  },
                  required: ["name", "type", "description", "importance"]
                }
              },
              triples: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    subject: { type: Type.STRING },
                    predicate: { type: Type.STRING },
                    object: { type: Type.STRING }
                  },
                  required: ["subject", "predicate", "object"]
                }
              },
              mermaidCode: { type: Type.STRING }
            },
            required: ["entities", "triples", "mermaidCode"]
          }
        }
      });

      const data = JSON.parse(response.text);
      setGraphData(data);
    } catch (err) {
      console.error(err);
      setError("Failed to generate knowledge graph. Please check your text or try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (graphData && mermaidRef.current) {
      const renderGraph = async () => {
        try {
          mermaidRef.current!.innerHTML = "";
          const id = "mermaid-svg-" + Math.random().toString(36).substr(2, 9);
          
          // Sanitize mermaid code: Ensure newline after graph LR and between nodes
          let cleanCode = graphData.mermaidCode.trim();
          if (cleanCode.startsWith("graph LR") && !cleanCode.startsWith("graph LR\n")) {
            cleanCode = cleanCode.replace("graph LR", "graph LR\n");
          }
          
          const { svg } = await mermaid.render(id, cleanCode);
          if (mermaidRef.current) {
            mermaidRef.current.innerHTML = svg;
            
            // Add click listeners to nodes
            const nodes = mermaidRef.current.querySelectorAll('.node');
            nodes.forEach(node => {
              node.addEventListener('click', () => {
                const labelNode = node.querySelector('.nodeLabel') || node.querySelector('text');
                const label = labelNode?.textContent?.trim();
                const entity = graphData.entities.find(e => e.name === label);
                if (entity) {
                  setSelectedEntity(entity);
                }
              });
            });
          }
        } catch (err) {
          console.error("Mermaid rendering failed:", err);
          if (mermaidRef.current) {
            mermaidRef.current.innerHTML = `
              <div class="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
                <div class="p-4 bg-orange-50 rounded-2xl border border-orange-100 text-center">
                  <p class="text-sm font-bold text-orange-800">Visualization Error</p>
                  <p class="text-[11px] mt-1">The AI generated a complex structure that couldn't be rendered. Try refining your text.</p>
                </div>
                <pre class="text-[10px] bg-slate-50 p-4 rounded-xl border border-slate-100 max-w-full overflow-auto">
                  ${graphData.mermaidCode}
                </pre>
              </div>
            `;
          }
        }
      };
      renderGraph();
    }
  }, [graphData]);

  const toggleFilter = (label: string) => {
    setActiveFilters(prev => 
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    );
  };

  const loadExample = () => {
    setInputText("Steve Jobs founded Apple in 1976 in California. Elon Musk founded SpaceX and Tesla. Tesla produces Electric Vehicles. Jeff Bezos founded Amazon in Seattle.");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#fdfaf6] font-sans text-slate-800">
      {/* Sidebar - Filter Panel */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col shadow-lg z-10 transition-all">
        <div className="p-6 border-bottom flex items-center gap-3">
          <div className="w-10 h-10 bg-[#e25d33] flex items-center justify-center rounded-xl shadow-lg shadow-orange-200">
             <Share2 size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">GraphMind</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Knowledge Generator</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Filter size={16} className="text-[#e25d33]" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Filters</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold text-slate-500 mb-3 block">Entity Types</span>
                <div className="flex flex-wrap gap-2">
                  {ENTITY_TYPES.map(type => (
                    <button 
                      key={type.label}
                      onClick={() => toggleFilter(type.label)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                        activeFilters.includes(type.label) 
                          ? `${type.color} text-white border-transparent shadow-md` 
                          : "bg-white text-slate-400 border-slate-100 hover:border-slate-300"
                      }`}
                    >
                      {type.icon}
                      {type.label}
                      {activeFilters.includes(type.label) && <CheckCircle2 size={10} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
              <Activity size={14} className="text-[#e25d33]" /> Live Insights
            </h3>
            {graphData ? (
              <div className="space-y-4">
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Nodes Exported</span>
                  <div className="text-2xl font-bold text-[#e25d33]">{graphData.entities.length}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Relationships</span>
                  <div className="text-2xl font-bold text-[#e25d33]">{graphData.triples.length}</div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No graph data currently available.</p>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-slate-400">STATUS</span>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          </div>
          <p className="text-[11px] font-medium text-slate-500">System Ready for NLP Processing</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-10 bg-gradient-to-br from-[#fdfaf6] to-[#fff5f2]">
        <div className="max-w-6xl mx-auto space-y-10 focus:outline-none">
          
          <header className="flex flex-col items-center gap-4 py-8 bg-white border border-slate-100 rounded-[2rem] shadow-xl shadow-orange-100/50">
            <div className="p-3 bg-orange-50 rounded-full">
              <Share2 size={32} className="text-[#e25d33]" />
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Knowledge Graph Generator</h1>
              <p className="text-slate-500 font-medium max-w-lg">
                Extract entities & relationships from unstructured text and visualize them as an interactive knowledge graph — with analytics, filtering, and multi-format export.
              </p>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Input Panel */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm space-y-6">
                <div className="flex items-center gap-2 mb-2">
                   <FileText size={18} className="text-[#e25d33]" />
                   <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Input Source</h3>
                </div>

                <div 
                  {...getRootProps()} 
                  className={`border-2 border-dashed rounded-2xl p-8 transition-all cursor-pointer flex flex-col items-center justify-center gap-4 ${
                    isDragActive ? "border-[#e25d33] bg-orange-50/50 scale-[0.98]" : "border-slate-100 hover:border-orange-200 hover:bg-orange-50/20"
                  }`}
                >
                  <input {...getInputProps()} />
                  <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center text-[#e25d33]">
                    <Upload size={24} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-700">Drag and drop file here</p>
                    <p className="text-xs text-slate-400 mt-1">Limit 200MB per file • TXT, PDF, DOCX, CSV</p>
                  </div>
                  <button className="px-5 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors">
                    Browse Files
                  </button>
                </div>

                <div className="relative group">
                  <div className="flex justify-between items-center mb-2 px-1">
                    <span className="text-xs font-bold text-slate-400">OR PASTE TEXT DIRECTLY</span>
                    <button 
                      onClick={loadExample}
                      className="text-[10px] font-bold text-[#e25d33] hover:underline"
                    >
                      LOAD EXAMPLE TEXT
                    </button>
                  </div>
                  <textarea 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Paste unstructured text here..."
                    className="w-full h-48 bg-slate-50 border-none rounded-2xl p-5 text-sm font-medium focus:ring-2 focus:ring-orange-200 resize-none transition-all placeholder:text-slate-300"
                  />
                </div>

                {error && (
                  <div className="p-4 bg-red-50 text-red-600 rounded-xl text-xs font-bold flex items-center gap-2">
                    <Activity size={14} /> {error}
                  </div>
                )}

                <motion.button 
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={generateGraph}
                  disabled={isGenerating}
                  className="w-full py-4 bg-[#e25d33] text-white rounded-2xl font-bold shadow-lg shadow-orange-300 hover:bg-[#c94b28] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Processing Semantic Data...</span>
                    </>
                  ) : (
                    <>
                      <Zap size={20} fill="currentColor" />
                      <span>Generate Knowledge Graph</span>
                    </>
                  )}
                </motion.button>
              </div>
            </div>

            {/* Options Panel */}
            <div className="space-y-6">
               <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm space-y-8">
                  <div className="flex items-center gap-2 mb-2">
                    <Settings size={18} className="text-[#e25d33]" />
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Processing Options</h3>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-3">
                      <label className="text-xs font-bold text-slate-500 flex justify-between">
                        SELECT MODEL
                        <span className="text-[10px] text-[#e25d33]">RECOMMENDED</span>
                      </label>
                      <select 
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-orange-200 outline-none"
                      >
                        <option value="gemini-2.0-flash">Gemini 2.0 Flash (Fast & Stable)</option>
                        <option value="gemini-flash-latest">Gemini Flash Latest</option>
                        <option value="gemini-3-flash-preview">Gemini 3 Flash (Experimental Adv)</option>
                        <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Deep extraction)</option>
                        <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite</option>
                      </select>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-50">
                       <label className="text-xs font-bold text-slate-500 flex justify-between">
                         BATCH SIZE (LARGE DOCS)
                         <span className="text-[#e25d33]">{batchSize}</span>
                       </label>
                       <input 
                         type="range" 
                         min="10" 
                         max="100" 
                         step="10"
                         value={batchSize}
                         onChange={(e) => setBatchSize(parseInt(e.target.value))}
                         className="w-full accent-[#e25d33] h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer" 
                       />
                    </div>

                    <div className="space-y-4">
                       <label className="text-xs font-bold text-slate-500 flex justify-between">
                         GRAPH HEIGHT (PX)
                         <span className="text-[#e25d33]">{graphHeight}px</span>
                       </label>
                       <input 
                         type="range" 
                         min="400" 
                         max="1200" 
                         step="20"
                         value={graphHeight}
                         onChange={(e) => setGraphHeight(parseInt(e.target.value))}
                         className="w-full accent-[#e25d33] h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer" 
                       />
                    </div>
                  </div>
               </div>

               {graphData && (
                 <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#e25d33] text-white rounded-3xl p-8 shadow-xl shadow-orange-300 flex flex-col gap-4"
                 >
                    <Download size={32} />
                    <div className="space-y-1">
                      <h4 className="font-bold">Ready to Export?</h4>
                      <p className="text-xs text-orange-100">Your knowledge graph is generated and ready for high-fidelity export.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                       <button className="bg-white/10 hover:bg-white/20 p-2 rounded-lg text-[10px] font-bold transition-all">EXPORT AS SVG</button>
                       <button className="bg-white/10 hover:bg-white/20 p-2 rounded-lg text-[10px] font-bold transition-all">EXPORT AS PNG</button>
                       <button className="bg-white/10 hover:bg-white/20 p-2 rounded-lg text-[10px] font-bold transition-all">JSON DATA</button>
                       <button className="bg-white/10 hover:bg-white/20 p-2 rounded-lg text-[10px] font-bold transition-all">RDF / TURTLE</button>
                    </div>
                 </motion.div>
               )}
            </div>
          </div>

          <AnimatePresence>
            {graphData && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-8"
              >
                <div className="bg-white border border-slate-200 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden min-h-[500px]">
                   <div className="absolute top-10 right-10 flex gap-2">
                      <button 
                        onClick={exportAsImage}
                        title="Export as PNG"
                        className="p-2 bg-slate-50 rounded-lg text-slate-400 hover:text-slate-800 transition-all shadow-sm border border-slate-100"
                      >
                        <Download size={16} />
                      </button>
                      <button 
                        onClick={exportAsPDF}
                        title="Export as PDF"
                        className="p-2 bg-slate-50 rounded-lg text-slate-400 hover:text-slate-800 transition-all shadow-sm border border-slate-100"
                      >
                        <FileText size={16} />
                      </button>
                      <button className="p-2 bg-slate-50 rounded-lg text-slate-400 hover:text-slate-800 transition-all shadow-sm border border-slate-100">
                        <Maximize2 size={16} />
                      </button>
                   </div>
                   
                   <div className="flex items-center gap-3 mb-10">
                      <div className="w-2 h-8 bg-[#e25d33] rounded-full" />
                      <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Interactive Knowledge Representation</h2>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-[0.2em] mt-1 text-center sm:text-left">SEMANTIC GRAPH LAYER</p>
                      </div>
                   </div>

                   <div 
                    ref={mermaidRef} 
                    style={{ height: `${graphHeight}px` }}
                    className="w-full flex items-center justify-center overflow-auto p-4 scrollbar-hide"
                   />
                </div>

                <div className="bg-white border border-slate-200 rounded-[2.5rem] p-10 shadow-xl overflow-hidden">
                   <div className="flex items-center gap-3 mb-8">
                      <Database size={24} className="text-[#e25d33]" />
                      <h3 className="text-xl font-bold text-slate-900 tracking-tight">Structured Extraction Analysis</h3>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                           <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Identified Entities</span>
                           <span className="text-xs font-bold text-[#e25d33] bg-orange-50 px-2 py-0.5 rounded-full">{graphData.entities.length} TOTAL</span>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-200">
                          {graphData.entities.map((entity, i) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-transparent hover:border-orange-200 hover:bg-white transition-all">
                              <span className="text-sm font-bold text-slate-700">{entity.name}</span>
                              <span className="text-[10px] font-black px-3 py-1 bg-white border border-slate-100 rounded-full text-slate-400 uppercase tracking-widest shadow-sm">
                                {entity.type}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                           <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Extracted Triples</span>
                           <span className="text-xs font-bold text-[#e25d33] bg-orange-50 px-2 py-0.5 rounded-full">{graphData.triples.length} RELATIONS</span>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-200">
                          {graphData.triples.map((triple, i) => (
                            <div key={i} className="flex flex-col gap-2 p-4 bg-slate-50/50 rounded-2xl border border-transparent hover:border-orange-200 hover:bg-white transition-all">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-800">{triple.subject}</span>
                                <ArrowUpRight size={12} className="text-slate-300" />
                                <span className="text-xs font-bold text-slate-800">{triple.object}</span>
                              </div>
                              <div className="text-[10px] font-black text-[#e25d33] flex items-center gap-1 uppercase tracking-widest">
                                <Zap size={10} fill="currentColor" /> {triple.predicate}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Feature Highlight Footer */}
          {!graphData && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-80">
               {[
                 { title: "Multi-format Upload", desc: "Supports PDF, DOCX, CSV, and TXT sources.", icon: <Upload size={20} /> },
                 { title: "Advanced NLP", desc: "Transformer-based NER and entity linking.", icon: <Activity size={20} /> },
                 { title: "Dynamic Viz", desc: "Interactive graphs using Mermaid technologies.", icon: <Share2 size={20} /> }
               ].map((f, i) => (
                 <div key={i} className="bg-white/50 backdrop-blur-sm border border-slate-100 p-6 rounded-[2rem] space-y-3">
                   <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-50 flex items-center justify-center text-[#e25d33]">
                      {f.icon}
                   </div>
                   <h4 className="font-bold text-slate-800">{f.title}</h4>
                   <p className="text-xs text-slate-500 leading-relaxed font-medium">{f.desc}</p>
                 </div>
               ))}
            </div>
          )}

          <footer className="pt-20 pb-10 text-center space-y-4">
             <div className="flex items-center justify-center gap-6">
                <p className="text-xs font-bold text-slate-400 tracking-widest">POWERED BY GRAPH MIND AI ENGINE</p>
                <div className="w-1 h-1 bg-slate-300 rounded-full" />
                <p className="text-xs font-bold text-slate-400 tracking-widest">V2.4 MISSION CONTROL</p>
             </div>
             <p className="text-[10px] text-slate-300 font-medium">Built for SR University Research Group • Guided by Dr. Neetu Prasad</p>
          </footer>

          {/* Entity Details Modal */}
          <AnimatePresence>
            {selectedEntity && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedEntity(null)}
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden relative"
                >
                  <button
                    onClick={() => setSelectedEntity(null)}
                    className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
                  >
                    <X size={18} />
                  </button>

                  <div className="p-8">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600">
                        <Info size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-slate-900">{selectedEntity.name}</h3>
                        <span className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 text-slate-500 uppercase tracking-wider">
                          {selectedEntity.type}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                        <p className="text-slate-600 leading-relaxed text-sm">
                          {selectedEntity.description}
                        </p>
                      </div>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedEntity(null)}
                      className="w-full mt-8 py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl shadow-slate-900/10"
                    >
                      Close Exploration
                    </motion.button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
