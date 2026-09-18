import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
import { UploadCloud, Loader2, Calendar, TrendingUp, TrendingDown, BookOpen, Users, X, Trash2, CheckCircle2, ChevronRight, AlertCircle, CheckSquare, Square, FileSpreadsheet, Search, ArrowUpDown, ArrowUp, ArrowDown, Edit2, Save } from 'lucide-react';
import { 
  ProcessedRecord, processMultipleFiles, processMappedData, getAvailableWeeks, getSchoolsByColor, getSchoolComparisons, 
  getGeneralAverage, getEvolutionData, extractDateRange, getSchoolOverallAverages
} from './utils';

const getSemaforoColor = (pct: number, type: string) => {
  if (type === 'EJA') {
    if (pct >= 80) return 'bg-emerald-500';
    if (pct >= 70) return 'bg-amber-500';
    return 'bg-rose-500';
  } else {
    if (pct >= 92) return 'bg-emerald-500';
    if (pct >= 85) return 'bg-amber-500';
    return 'bg-rose-500';
  }
};

const getSemaforoHex = (pct: number, type: string) => {
  if (type === 'EJA') {
    if (pct >= 80) return '#10b981';
    if (pct >= 70) return '#f59e0b';
    return '#f43f5e';
  } else {
    if (pct >= 92) return '#10b981';
    if (pct >= 85) return '#f59e0b';
    return '#f43f5e';
  }
};

const SemaforoBadge = ({ pct, type }: { pct: number, type: string }) => (
  <div 
    className={`w-3 h-3 rounded-full shadow-sm ${getSemaforoColor(pct, type)}`} 
    title={`Frequência: ${pct.toFixed(2)}%`}
  />
);

type PeriodMapping = { original: string, mappedName: string, selected: boolean };
type TabConfig = {
  enabled: boolean;
  mappings: PeriodMapping[];
};
type ConsolidatedData = {
  Regular: { rawData: any[], headers: string[] };
  EJA: { rawData: any[], headers: string[] };
};

export default function App() {
  const [data, setData] = useState<ProcessedRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'Regular' | 'EJA'>('Regular');
  
  // Upload flow state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadStep, setUploadStep] = useState<1 | 2>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState<string>('');
  const [uploadStats, setUploadStats] = useState({ fileCount: 0 });
  
  // Consolidated batch mapping state
  const [consolidatedData, setConsolidatedData] = useState<ConsolidatedData>({
    Regular: { rawData: [], headers: [] },
    EJA: { rawData: [], headers: [] }
  });
  
  const [regularCfg, setRegularCfg] = useState<TabConfig>({ enabled: false, mappings: [] });
  const [ejaCfg, setEjaCfg] = useState<TabConfig>({ enabled: false, mappings: [] });

  // Dashboard state
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isDeletePeriodConfirmOpen, setIsDeletePeriodConfirmOpen] = useState(false);
  const [isDeleteSchoolConfirmOpen, setIsDeleteSchoolConfirmOpen] = useState<{escola: string} | null>(null);
  const [isEditRecordModalOpen, setIsEditRecordModalOpen] = useState<ProcessedRecord | null>(null);
  const [editRecordForm, setEditRecordForm] = useState<{
    id: string;
    escola: string;
    porcentagem: number;
    semana: string;
    matriculados: number;
    applyToAll: boolean;
  } | null>(null);

  // Modal de Matrículas por Escola
  const [isMatriculasModalOpen, setIsMatriculasModalOpen] = useState(false);
  const [matriculasList, setMatriculasList] = useState<{ escola: string; matriculados: number }[]>([]);
  const [matriculasFilter, setMatriculasFilter] = useState('');
  const [isSavingMatriculas, setIsSavingMatriculas] = useState(false);
  const [matriculasFeedback, setMatriculasFeedback] = useState<string | null>(null);
  const [quickMatriculaModal, setQuickMatriculaModal] = useState<{ escola: string; matriculados: number } | null>(null);

  // Table filtering and sorting state
  const [filterText, setFilterText] = useState('');
  const [sortCol, setSortCol] = useState<'escola' | 'porcentagem' | 'matriculados' | 'presentes'>('escola');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [tableViewMode, setTableViewMode] = useState<'semana' | 'geral'>('semana');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = () => {
    fetch('/api/frequencia')
      .then(res => res.json())
      .then(rows => {
        if (Array.isArray(rows)) {
          setData(rows);
        }
      })
      .catch(err => console.error("Error loading data:", err));
  };

  const availableWeeks = useMemo(() => getAvailableWeeks(data, activeTab), [data, activeTab]);

  useEffect(() => {
    if (availableWeeks.length > 0 && (!selectedWeek || !availableWeeks.includes(selectedWeek))) {
      setSelectedWeek(availableWeeks[availableWeeks.length - 1]);
    }
  }, [availableWeeks, selectedWeek]);

  // Handle Multi-File Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    
    setIsProcessing(true);
    setUploadError('');
    setUploadStats({ fileCount: files.length });

    try {
      const consolidated = await processMultipleFiles(files);
      setConsolidatedData(consolidated);
      
      const buildCfg = (dataObj: { rawData: any[], headers: string[] }): TabConfig => {
        const mappings = dataObj.headers
          .map(h => ({
             original: h,
             mappedName: extractDateRange(h),
             selected: true
          }));
          
        return { enabled: dataObj.rawData.length > 0 && mappings.length > 0, mappings };
      };

      setRegularCfg(buildCfg(consolidated.Regular));
      setEjaCfg(buildCfg(consolidated.EJA));
      setUploadStep(2);
    } catch (err) {
      console.error(err);
      setUploadError("Erro ao processar os arquivos. Verifique se estão no formato correto e não estão corrompidos.");
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError('');
    
    let newRecords: ProcessedRecord[] = [];

    if (regularCfg.enabled) {
      const active = regularCfg.mappings.filter(m => m.selected && m.mappedName.trim() !== '');
      if (active.length > 0) {
         newRecords = newRecords.concat(processMappedData(consolidatedData.Regular.rawData, '_ESCOLA_', active, 'Regular'));
      }
    }

    if (ejaCfg.enabled) {
      const active = ejaCfg.mappings.filter(m => m.selected && m.mappedName.trim() !== '');
      if (active.length > 0) {
         newRecords = newRecords.concat(processMappedData(consolidatedData.EJA.rawData, '_ESCOLA_', active, 'EJA'));
      }
    }

    if (newRecords.length === 0) {
      setUploadError("Nenhuma configuração válida selecionada. Ative pelo menos um setor (Regular ou EJA) e verifique os períodos.");
      return;
    }

    setIsProcessing(true);
    try {
      await fetch('/api/frequencia/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: newRecords })
      });
      
      fetchData();
      closeUploadModal();
    } catch (err) {
      console.error("Error processing file:", err);
      setUploadError("Erro ao salvar os dados no banco de dados.");
    } finally {
      setIsProcessing(false);
    }
  };

  const closeUploadModal = () => {
    setIsUploadModalOpen(false);
    setUploadStep(1);
    setConsolidatedData({ Regular: { rawData: [], headers: [] }, EJA: { rawData: [], headers: [] } });
    setUploadError('');
  };

  const handleConfirmClear = async () => {
    setIsClearConfirmOpen(false);
    try {
      await fetch(`/api/frequencia/clear/${activeTab}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error("Error clearing data:", err);
    }
  };

  const handleConfirmDeletePeriod = async () => {
    setIsDeletePeriodConfirmOpen(false);
    try {
      await fetch(`/api/frequencia/period/${activeTab}/${encodeURIComponent(selectedWeek)}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error("Error deleting period:", err);
    }
  };

  const handleConfirmDeleteSchool = async () => {
    if (!isDeleteSchoolConfirmOpen) return;
    try {
      await fetch(`/api/frequencia/school/${activeTab}/${encodeURIComponent(isDeleteSchoolConfirmOpen.escola)}`, { method: 'DELETE' });
      setIsDeleteSchoolConfirmOpen(null);
      if (selectedSchool === isDeleteSchoolConfirmOpen.escola) setSelectedSchool(null);
      fetchData();
    } catch (err) {
      console.error("Error deleting school:", err);
    }
  };

  const handleOpenEditRecord = (rec: ProcessedRecord) => {
    setIsEditRecordModalOpen(rec);
    setEditRecordForm({
      id: rec.id,
      escola: rec.escola,
      porcentagem: rec.porcentagem,
      semana: rec.semana,
      matriculados: rec.matriculados ?? 0,
      applyToAll: true
    });
  };

  const handleEditRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRecordForm) return;
    try {
      await fetch(`/api/frequencia/${editRecordForm.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escola: editRecordForm.escola,
          porcentagem: editRecordForm.porcentagem,
          semana: editRecordForm.semana,
          matriculados: editRecordForm.matriculados,
          applyToAllPeriods: editRecordForm.applyToAll,
          tipo: activeTab
        })
      });
      setIsEditRecordModalOpen(null);
      setEditRecordForm(null);
      fetchData();
    } catch (err) {
      console.error("Error editing record:", err);
    }
  };

  const openMatriculasModal = () => {
    setIsMatriculasModalOpen(true);
    setMatriculasFeedback(null);
    fetch(`/api/matriculas/${activeTab}`)
      .then(res => res.json())
      .then(rows => {
        if (Array.isArray(rows)) {
          setMatriculasList(rows.map(r => ({ escola: r.escola, matriculados: r.matriculados || 0 })));
        }
      })
      .catch(err => console.error("Error loading matriculas:", err));
  };

  const handleSaveMatriculas = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingMatriculas(true);
    try {
      const updates = matriculasList.map(m => ({
        escola: m.escola,
        tipo: activeTab,
        matriculados: Math.max(0, parseInt(String(m.matriculados), 10) || 0)
      }));
      await fetch('/api/matriculas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });
      setMatriculasFeedback('Matrículas salvas com sucesso! As médias foram recalculadas.');
      fetchData();
      setTimeout(() => {
        setMatriculasFeedback(null);
      }, 3000);
    } catch (err) {
      console.error("Error saving matriculas:", err);
      setMatriculasFeedback('Erro ao salvar as matrículas.');
    } finally {
      setIsSavingMatriculas(false);
    }
  };

  const handleSaveQuickMatricula = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickMatriculaModal) return;
    try {
      await fetch('/api/matriculas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escola: quickMatriculaModal.escola,
          tipo: activeTab,
          matriculados: Math.max(0, parseInt(String(quickMatriculaModal.matriculados), 10) || 0)
        })
      });
      setQuickMatriculaModal(null);
      fetchData();
    } catch (err) {
      console.error("Error saving quick matricula:", err);
    }
  };

  // Dashboard Data
  const currentWeekIdx = availableWeeks.indexOf(selectedWeek);
  const previousWeek = currentWeekIdx > 0 ? availableWeeks[currentWeekIdx - 1] : null;

  const { verde, amarelo, vermelho } = useMemo(() => getSchoolsByColor(data, selectedWeek, activeTab), [data, selectedWeek, activeTab]);
  const { highestGrowth, highestDecline } = useMemo(() => getSchoolComparisons(data, selectedWeek, previousWeek, activeTab), [data, selectedWeek, previousWeek, activeTab]);
  
  const generalAverages = useMemo(() => getGeneralAverage(data, activeTab), [data, activeTab]);
  
  const currentWeekObj = generalAverages.find(g => g.semana === selectedWeek);
  const currentWeekAvg = currentWeekObj?.media || 0;
  const currentWeekMatriculados = currentWeekObj?.totalMatriculados || 0;
  const currentWeekPresentes = currentWeekObj?.totalPresentes || 0;
  const isCurrentWeekWeighted = currentWeekObj?.isWeighted || false;
  const currentWeekEscolasComMatricula = currentWeekObj?.escolasComMatricula || 0;
  const currentWeekTotalEscolas = currentWeekObj?.totalEscolas || 0;
  
  const previousWeekIndex = generalAverages.findIndex(g => g.semana === selectedWeek) - 1;
  const previousWeekAvg = previousWeekIndex >= 0 ? generalAverages[previousWeekIndex].media : null;
  const evolutionAvg = previousWeekAvg ? (currentWeekAvg - previousWeekAvg).toFixed(2) : '0.00';
  const evolutionAvgNum = parseFloat(evolutionAvg);

  const selectedSchoolData = useMemo(() => selectedSchool ? getEvolutionData(data, selectedSchool, activeTab) : [], [data, selectedSchool, activeTab]);
  const overallAverages = useMemo(() => getSchoolOverallAverages(data, activeTab), [data, activeTab]);

  const filteredAndSortedSchools = useMemo(() => {
    let rawList = tableViewMode === 'semana'
       ? data.filter(d => d.semana === selectedWeek && d.tipo === activeTab)
       : overallAverages;
    
    // Normalizar e computar presentes de cada escola: presentes = (matriculados * frequencia) / 100
    let list = rawList.map(d => {
      const mat = typeof d.matriculados === 'number' && d.matriculados > 0 ? d.matriculados : null;
      const pres = mat !== null ? Math.round((mat * d.porcentagem) / 100) : null;
      return {
        ...d,
        matriculados: mat,
        presentes: pres
      };
    });

    if (filterText.trim()) {
       const lowerFilter = filterText.toLowerCase();
       list = list.filter(d => d.escola.toLowerCase().includes(lowerFilter));
    }

    list.sort((a, b) => {
       if (sortCol === 'escola') {
         return sortDir === 'asc' ? a.escola.localeCompare(b.escola) : b.escola.localeCompare(a.escola);
       } else if (sortCol === 'matriculados') {
         const matA = a.matriculados ?? 0;
         const matB = b.matriculados ?? 0;
         return sortDir === 'asc' ? matA - matB : matB - matA;
       } else if (sortCol === 'presentes') {
         const presA = a.presentes ?? 0;
         const presB = b.presentes ?? 0;
         return sortDir === 'asc' ? presA - presB : presB - presA;
       } else {
         return sortDir === 'asc' ? a.porcentagem - b.porcentagem : b.porcentagem - a.porcentagem;
       }
    });

    return list;
  }, [data, selectedWeek, activeTab, filterText, sortCol, sortDir, tableViewMode, overallAverages]);

  // Totais agregados da rede (resumo do cálculo ponderado)
  const networkTotals = useMemo(() => {
    let totalMat = 0;
    let totalPres = 0;
    let countComMat = 0;

    filteredAndSortedSchools.forEach(s => {
      if (typeof s.matriculados === 'number' && s.matriculados > 0) {
        totalMat += s.matriculados;
        const pres = (s.matriculados * s.porcentagem) / 100;
        totalPres += pres;
        countComMat += 1;
      }
    });

    const mediaPonderada = totalMat > 0 
      ? Number(((totalPres / totalMat) * 100).toFixed(2))
      : 0;

    return {
      totalMatriculados: totalMat,
      totalPresentes: Math.round(totalPres),
      mediaPonderada,
      countComMat,
      totalEscolas: filteredAndSortedSchools.length
    };
  }, [filteredAndSortedSchools]);

  const toggleSort = (col: 'escola' | 'porcentagem' | 'matriculados' | 'presentes') => {
    if (sortCol === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  // Render a Config Panel for the Modal
  const renderConfigPanel = (title: string, type: 'Regular' | 'EJA', cfg: TabConfig, setCfg: React.Dispatch<React.SetStateAction<TabConfig>>) => {
      const dataLength = consolidatedData[type].rawData.length;
      
      if (!cfg.enabled) {
          return (
              <div className="border border-slate-200 rounded-lg p-4 flex items-center justify-between bg-white shadow-sm opacity-75 hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${type === 'Regular' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {type === 'Regular' ? <BookOpen className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                      </div>
                      <div>
                        <span className="block font-semibold text-slate-700">{title}</span>
                        {dataLength > 0 ? (
                          <span className="text-xs text-slate-500">{dataLength} registros identificados</span>
                        ) : (
                          <span className="text-xs text-slate-400">Nenhum dado encontrado</span>
                        )}
                      </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setCfg({...cfg, enabled: true})} 
                    disabled={dataLength === 0}
                    className="flex items-center gap-2 text-indigo-600 text-sm font-semibold hover:bg-indigo-100 transition-colors bg-indigo-50 px-3 py-1.5 rounded-md disabled:opacity-50 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                      <Square className="w-4 h-4" /> Ativar
                  </button>
              </div>
          );
      }
      
      return (
          <div className="border border-slate-300 rounded-lg bg-white shadow-sm overflow-hidden ring-1 ring-black/5">
              <div className={`px-4 py-3 flex justify-between items-center ${type === 'Regular' ? 'bg-indigo-50/50 border-b border-indigo-100' : 'bg-emerald-50/50 border-b border-emerald-100'}`}>
                  <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-md ${type === 'Regular' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {type === 'Regular' ? <BookOpen className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                      </div>
                      <span className={`font-bold ${type === 'Regular' ? 'text-indigo-900' : 'text-emerald-900'}`}>Dados: {title}</span>
                  </div>
                  <button type="button" onClick={() => setCfg({...cfg, enabled: false})} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors">
                      <CheckSquare className="w-4 h-4 text-indigo-600" /> Ativado
                  </button>
              </div>
              
              <div className="p-5 space-y-5">
                  <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-slate-700">A coluna Escola foi detectada automaticamente</p>
                        <p className="text-xs text-slate-500 mt-0.5">Lidos e consolidados <strong>{dataLength}</strong> registros de escolas.</p>
                      </div>
                  </div>

                  <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1">Períodos Identificados (Formatados)</label>
                      <p className="text-xs text-slate-500 mb-3">O sistema leu os nomes das colunas e os padronizou. Confirme se as datas estão corretas.</p>
                      
                      <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200 max-h-56 overflow-y-auto">
                        {cfg.mappings.length === 0 && <p className="text-sm text-slate-500 p-2 italic text-center">Nenhum período de frequência detectado.</p>}
                        
                        {cfg.mappings.map((mapping, idx) => (
                          <div key={idx} className="flex items-center gap-3 bg-white p-2.5 rounded border border-slate-200 shadow-sm transition-all hover:border-indigo-200">
                            <input 
                              type="checkbox" 
                              checked={mapping.selected}
                              onChange={(e) => {
                                const newMappings = [...cfg.mappings];
                                newMappings[idx].selected = e.target.checked;
                                setCfg({...cfg, mappings: newMappings});
                              }}
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                            />
                            <div className="flex-1 grid grid-cols-2 gap-4 items-center">
                              <div className="truncate">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Coluna Original</p>
                                <p className="text-xs font-medium text-slate-600 truncate bg-slate-100 px-2 py-1 rounded inline-block w-full" title={mapping.original}>{mapping.original}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                  Nome Extraído (Dashboard)
                                </p>
                                <input 
                                  type="text" 
                                  value={mapping.mappedName}
                                  onChange={(e) => {
                                    const newMappings = [...cfg.mappings];
                                    newMappings[idx].mappedName = e.target.value;
                                    setCfg({...cfg, mappings: newMappings});
                                  }}
                                  placeholder="ex: 27/08 a 02/09"
                                  className={`w-full px-2 py-1.5 border rounded text-sm font-semibold transition-colors focus:ring-2 focus:ring-indigo-500 ${mapping.selected ? 'border-indigo-200 bg-indigo-50/30 text-indigo-900' : 'border-slate-200 bg-slate-50 text-slate-400'}`}
                                  disabled={!mapping.selected}
                                />
                              </div>
                            </div>
                          </div>
                        ))}

                        <div className="mt-3 pt-3 border-t border-slate-200">
                           <select 
                              className="w-full px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-600 bg-white hover:border-indigo-300 transition-colors cursor-pointer"
                              onChange={(e) => {
                                if (!e.target.value) return;
                                if (cfg.mappings.find(p => p.original === e.target.value)) return;
                                setCfg({...cfg, mappings: [...cfg.mappings, { original: e.target.value, mappedName: extractDateRange(e.target.value), selected: true }]});
                                e.target.value = "";
                              }}
                           >
                             <option value="">+ Adicionar outra coluna manualmente...</option>
                             {consolidatedData[type].headers.filter(h => h !== '_ESCOLA_' && !cfg.mappings.find(p => p.original === h)).map(h => (
                               <option key={h} value={h}>{h}</option>
                             ))}
                           </select>
                        </div>
                      </div>
                  </div>
              </div>
          </div>
      );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-8 font-sans">
      <div className="max-w-[1200px] mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Frequência Escolar</h1>
            <p className="text-slate-500 text-sm mt-1">Acompanhamento e evolução da frequência dos alunos.</p>
          </div>
          
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('Regular')}
              className={`flex items-center gap-2 px-6 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'Regular' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
            >
              <BookOpen className="w-4 h-4" />
              Ensino Regular
            </button>
            <button
              onClick={() => setActiveTab('EJA')}
              className={`flex items-center gap-2 px-6 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'EJA' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
            >
              <Users className="w-4 h-4" />
              EJA
            </button>
          </div>
        </header>

        {/* Main Actions & Selectors */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              Período Selecionado:
            </label>
            <div className="flex items-center gap-2">
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-500 min-w-[200px]"
                disabled={availableWeeks.length === 0}
              >
                {availableWeeks.length === 0 && <option value="">Sem dados...</option>}
                {availableWeeks.map(w => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
              {availableWeeks.length > 0 && (
                <button
                  onClick={() => setIsDeletePeriodConfirmOpen(true)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  title="Excluir período selecionado"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button 
              onClick={openMatriculasModal}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg shadow-sm text-sm font-semibold hover:bg-indigo-100 transition-colors"
              title="Inserir ou editar a quantidade de alunos matriculados nas escolas para cálculo ponderado"
            >
              <Users className="w-4 h-4 text-indigo-600" />
              Alunos Matriculados
            </button>

            <button 
              onClick={() => setIsUploadModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg shadow-sm text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Importar Planilhas XLSX
            </button>
            
            {availableWeeks.length > 0 && (
              <button 
                onClick={() => setIsClearConfirmOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-rose-200 text-rose-600 rounded-lg shadow-sm text-sm font-medium hover:bg-rose-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Limpar {activeTab}
              </button>
            )}
          </div>
        </div>

        {/* Dashboard */}
        {availableWeeks.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-4">
              <FileSpreadsheet className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800">Nenhum dado de {activeTab} carregado</h3>
            <p className="text-slate-500 max-w-md mt-2">
              Faça o upload do(s) arquivo(s) Excel contendo as colunas de escola e as frequências por período para visualizar os relatórios. Você pode enviar vários arquivos de uma vez.
            </p>
            <button 
              onClick={() => setIsUploadModalOpen(true)}
              className="mt-6 flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg shadow-sm text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <UploadCloud className="w-4 h-4" />
              Iniciar Importação
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* KPI Row and Legend */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-center relative overflow-hidden md:col-span-1">
                <div className="absolute top-0 right-0 p-6 opacity-10">
                  <TrendingUp className="w-24 h-24" />
                </div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Média Geral ({selectedWeek})</h3>
                  {isCurrentWeekWeighted ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200" title="Média Ponderada = Total de Presentes ÷ Total de Matriculados">
                      <Users className="w-3 h-3" /> Ponderada
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full" title="Média aritmética simples. Insira as matrículas para ponderar pelo tamanho de cada escola.">
                      Média Simples
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-bold text-slate-800 flex items-center gap-3">
                    {currentWeekAvg > 0 && <SemaforoBadge pct={currentWeekAvg} type={activeTab} />}
                    {currentWeekAvg.toFixed(2)}%
                  </span>
                </div>
                {previousWeekAvg && (
                  <span className={`text-sm font-medium mt-1 flex items-center gap-1 ${evolutionAvgNum >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {evolutionAvgNum >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {evolutionAvgNum > 0 ? '+' : ''}{evolutionAvg}% vs sem. anterior
                  </span>
                )}
                
                {isCurrentWeekWeighted ? (
                  <div className="mt-3 bg-slate-50 border border-slate-200/90 rounded-lg p-2.5 space-y-1 text-xs">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Total Alunos Presentes:</span>
                      <strong className="text-emerald-700 font-bold">{currentWeekPresentes.toLocaleString('pt-BR')}</strong>
                    </div>
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Total Alunos Matriculados:</span>
                      <strong className="text-indigo-700 font-bold">{currentWeekMatriculados.toLocaleString('pt-BR')}</strong>
                    </div>
                    <div className="pt-1 border-t border-slate-200 text-[11px] text-slate-500 flex justify-between items-center">
                      <span>Cálculo: (Presentes ÷ Matriculados)</span>
                      <span className="font-semibold text-slate-800">
                        {currentWeekPresentes.toLocaleString('pt-BR')} ÷ {currentWeekMatriculados.toLocaleString('pt-BR')} = {currentWeekAvg.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800 flex items-center justify-between">
                    <span>Sem matrículas (média simples).</span>
                    <button onClick={openMatriculasModal} className="font-semibold text-indigo-600 hover:underline">
                      Cadastrar matrículas &rarr;
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:col-span-1 flex flex-col justify-center">
                 <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-indigo-500" />
                    Calibragem do Semáforo ({activeTab})
                 </h3>
                 <ul className="space-y-3 text-sm text-slate-600 font-medium">
                   <li className="flex items-center gap-3">
                     <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shrink-0" />
                     Frequência ≥ {activeTab === 'EJA' ? '80%' : '92%'}
                   </li>
                   <li className="flex items-center gap-3">
                     <div className="w-3 h-3 rounded-full bg-amber-500 shadow-sm shrink-0" />
                     Frequência entre {activeTab === 'EJA' ? '70% a 79,9%' : '85% a 91,9%'}
                   </li>
                   <li className="flex items-center gap-3">
                     <div className="w-3 h-3 rounded-full bg-rose-500 shadow-sm shrink-0" />
                     Frequência &lt; {activeTab === 'EJA' ? '70%' : '85%'}
                   </li>
                 </ul>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:col-span-1 flex flex-col">
                 <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 shrink-0">Evolução Geral (Todas as Semanas)</h3>
                 <div className="h-[140px] w-full grow">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={generalAverages} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                        <XAxis dataKey="semana" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis domain={['auto', 'auto']} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                        <RechartsTooltip 
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          formatter={(value: number) => [`${value}%`, 'Média']}
                        />
                        <Line type="monotone" dataKey="media" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                 </div>
              </div>
            </div>

            {/* Growth/Decline Summary & Colored Tables */}
            <div className="space-y-6">
              
              {/* Summary Cards */}
              {previousWeek && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl shadow-sm border border-emerald-100 overflow-hidden p-5 flex flex-col justify-center">
                    <h3 className="text-sm font-semibold text-emerald-800 flex items-center gap-2 mb-3">
                      <TrendingUp className="w-5 h-5" /> Maiores Crescimentos vs {previousWeek}
                    </h3>
                    {highestGrowth.length > 0 ? (
                      <div className="space-y-2">
                        {highestGrowth.map(c => (
                          <div key={c.escola} className="flex justify-between items-center text-sm border-b border-emerald-50 pb-2 last:border-0 last:pb-0">
                            <span className="text-slate-600 truncate mr-4">{c.escola}</span>
                            <span className="font-bold text-emerald-600 flex items-center gap-1 shrink-0">
                              +{c.delta}% <ArrowUp className="w-3 h-3" />
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 italic">Nenhum crescimento registrado na semana.</p>
                    )}
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-rose-100 overflow-hidden p-5 flex flex-col justify-center">
                    <h3 className="text-sm font-semibold text-rose-800 flex items-center gap-2 mb-3">
                      <TrendingDown className="w-5 h-5" /> Maiores Quedas vs {previousWeek}
                    </h3>
                    {highestDecline.length > 0 ? (
                      <div className="space-y-2">
                        {highestDecline.map(c => (
                          <div key={c.escola} className="flex justify-between items-center text-sm border-b border-rose-50 pb-2 last:border-0 last:pb-0">
                            <span className="text-slate-600 truncate mr-4">{c.escola}</span>
                            <span className="font-bold text-rose-600 flex items-center gap-1 shrink-0">
                              {c.delta}% <ArrowDown className="w-3 h-3" />
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 italic">Nenhuma queda registrada na semana.</p>
                    )}
                  </div>
                </div>
              )}

              {/* 3 Columns: Verde, Amarelo, Vermelho */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Verde */}
                <div className="bg-white rounded-xl shadow-sm border border-emerald-100 overflow-hidden flex flex-col h-[400px]">
                  <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-100 flex items-center justify-between shrink-0">
                    <h3 className="font-bold text-emerald-800 flex items-center gap-2 text-sm">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      Atenção Mínima ({verde.length})
                    </h3>
                  </div>
                  <div className="p-0 overflow-y-auto grow">
                    <table className="w-full text-sm text-left">
                      <tbody className="divide-y divide-slate-100">
                        {verde.map(s => (
                          <tr key={s.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setSelectedSchool(s.escola)}>
                            <td className="px-4 py-2 font-medium text-slate-700 truncate max-w-[150px]">{s.escola}</td>
                            <td className="px-4 py-2 text-right font-bold text-emerald-600">{s.porcentagem.toFixed(2)}%</td>
                          </tr>
                        ))}
                        {verde.length === 0 && <tr><td colSpan={2} className="px-4 py-4 text-center text-slate-500 text-sm italic">Vazio.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Amarelo */}
                <div className="bg-white rounded-xl shadow-sm border border-amber-100 overflow-hidden flex flex-col h-[400px]">
                  <div className="bg-amber-50 px-4 py-3 border-b border-amber-100 flex items-center justify-between shrink-0">
                    <h3 className="font-bold text-amber-800 flex items-center gap-2 text-sm">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      Atenção Média ({amarelo.length})
                    </h3>
                  </div>
                  <div className="p-0 overflow-y-auto grow">
                    <table className="w-full text-sm text-left">
                      <tbody className="divide-y divide-slate-100">
                        {amarelo.map(s => (
                          <tr key={s.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setSelectedSchool(s.escola)}>
                            <td className="px-4 py-2 font-medium text-slate-700 truncate max-w-[150px]">{s.escola}</td>
                            <td className="px-4 py-2 text-right font-bold text-amber-600">{s.porcentagem.toFixed(2)}%</td>
                          </tr>
                        ))}
                        {amarelo.length === 0 && <tr><td colSpan={2} className="px-4 py-4 text-center text-slate-500 text-sm italic">Vazio.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Vermelho */}
                <div className="bg-white rounded-xl shadow-sm border border-rose-100 overflow-hidden flex flex-col h-[400px]">
                  <div className="bg-rose-50 px-4 py-3 border-b border-rose-100 flex items-center justify-between shrink-0">
                    <h3 className="font-bold text-rose-800 flex items-center gap-2 text-sm">
                      <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      Atenção Máxima ({vermelho.length})
                    </h3>
                  </div>
                  <div className="p-0 overflow-y-auto grow">
                    <table className="w-full text-sm text-left">
                      <tbody className="divide-y divide-slate-100">
                        {vermelho.map(s => (
                          <tr key={s.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setSelectedSchool(s.escola)}>
                            <td className="px-4 py-2 font-medium text-slate-700 truncate max-w-[150px]">{s.escola}</td>
                            <td className="px-4 py-2 text-right font-bold text-rose-600">{s.porcentagem.toFixed(2)}%</td>
                          </tr>
                        ))}
                        {vermelho.length === 0 && <tr><td colSpan={2} className="px-4 py-4 text-center text-slate-500 text-sm italic">Vazio.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>

            {/* Full List */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[600px]">
              <div className="px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row justify-between items-center gap-4 bg-slate-50 shrink-0">
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-800">
                    Todas as Escolas - {tableViewMode === 'semana' ? selectedWeek : 'Média Geral'}
                  </h3>
                  <span className="text-xs text-slate-500">Clique em uma escola para ver o histórico</span>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
                  <div className="flex bg-slate-100 p-1 rounded-lg w-full sm:w-auto">
                    <button
                      onClick={() => setTableViewMode('semana')}
                      className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        tableViewMode === 'semana'
                          ? 'bg-white text-indigo-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Por Semana
                    </button>
                    <button
                      onClick={() => setTableViewMode('geral')}
                      className={`flex-1 sm:flex-none px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        tableViewMode === 'geral'
                          ? 'bg-white text-indigo-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Média Geral
                    </button>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Pesquisar escola..."
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Formula banner */}
              {networkTotals.totalMatriculados > 0 && (
                <div className="bg-indigo-50/70 border-b border-indigo-100 px-6 py-2.5 text-xs text-indigo-900 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">Cálculo da Média Ponderada da Rede:</span>
                    <span>
                      Multiplicação de cada escola (Matriculados × Freq) = {networkTotals.totalPresentes.toLocaleString('pt-BR')} presentes ÷ {networkTotals.totalMatriculados.toLocaleString('pt-BR')} matriculados
                    </span>
                  </div>
                  <div className="font-bold text-indigo-700 bg-white px-2.5 py-1 rounded border border-indigo-200 shadow-2xs">
                    Média da Rede: {networkTotals.mediaPonderada.toFixed(2)}%
                  </div>
                </div>
              )}

              <div className="overflow-y-auto grow">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white text-slate-500 text-xs uppercase sticky top-0 shadow-sm z-10 border-b border-slate-200">
                    <tr>
                      <th 
                        className="px-6 py-4 font-medium cursor-pointer hover:bg-slate-50 transition-colors group"
                        onClick={() => toggleSort('escola')}
                      >
                        <div className="flex items-center gap-2">
                          Unidade Escolar
                          <span className="text-slate-400 group-hover:text-indigo-500">
                            {sortCol === 'escola' ? (sortDir === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-50" />}
                          </span>
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 font-medium text-right cursor-pointer hover:bg-slate-50 transition-colors group"
                        onClick={() => toggleSort('matriculados')}
                      >
                        <div className="flex items-center justify-end gap-2">
                          Matriculados
                          <span className="text-slate-400 group-hover:text-indigo-500">
                            {sortCol === 'matriculados' ? (sortDir === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-50" />}
                          </span>
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 font-medium text-right cursor-pointer hover:bg-slate-50 transition-colors group"
                        onClick={() => toggleSort('presentes')}
                      >
                        <div className="flex items-center justify-end gap-2" title="Alunos presentes = Matriculados × Frequência">
                          Presentes
                          <span className="text-slate-400 group-hover:text-indigo-500">
                            {sortCol === 'presentes' ? (sortDir === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-50" />}
                          </span>
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 font-medium text-right cursor-pointer hover:bg-slate-50 transition-colors group"
                        onClick={() => toggleSort('porcentagem')}
                      >
                        <div className="flex items-center justify-end gap-2">
                          Frequência (%)
                          <span className="text-slate-400 group-hover:text-indigo-500">
                            {sortCol === 'porcentagem' ? (sortDir === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />) : <ArrowUpDown className="w-4 h-4 opacity-50" />}
                          </span>
                        </div>
                      </th>
                      <th className="px-6 py-4 font-medium text-right w-24">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAndSortedSchools.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-6 py-3 font-medium text-slate-700 cursor-pointer group-hover:text-indigo-600 transition-colors" onClick={() => setSelectedSchool(s.escola)}>
                          {s.escola}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQuickMatriculaModal({ escola: s.escola, matriculados: s.matriculados || 0 });
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md transition-colors bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 cursor-pointer"
                            title="Clique para editar o número de alunos matriculados desta escola"
                          >
                            <Users className="w-3 h-3 text-slate-400 group-hover:text-indigo-500" />
                            {typeof s.matriculados === 'number' && s.matriculados > 0 ? (
                              <span>{s.matriculados.toLocaleString('pt-BR')}</span>
                            ) : (
                              <span className="text-indigo-600 font-medium">+ Inserir</span>
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-3 text-right font-medium">
                          {typeof s.presentes === 'number' && s.presentes > 0 ? (
                            <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-100" title={`${s.matriculados} matriculados × ${s.porcentagem.toFixed(2)}%`}>
                              {s.presentes.toLocaleString('pt-BR')}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-right text-slate-800 font-medium cursor-pointer" onClick={() => setSelectedSchool(s.escola)}>
                          <div className="flex items-center justify-end gap-3">
                            {s.porcentagem.toFixed(2)}%
                            <SemaforoBadge pct={s.porcentagem} type={activeTab} />
                          </div>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            {tableViewMode === 'semana' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleOpenEditRecord(s); }}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                title="Editar registro"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setIsDeleteSchoolConfirmOpen({ escola: s.escola }); }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              title="Excluir escola de todos os períodos"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredAndSortedSchools.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                          Nenhuma escola encontrada.
                        </td>
                      </tr>
                    )}
                  </tbody>

                  {/* Table Footer with Network Totals */}
                  {filteredAndSortedSchools.length > 0 && (
                    <tfoot className="bg-slate-50/90 border-t-2 border-slate-200 font-semibold text-slate-800 text-xs uppercase sticky bottom-0">
                      <tr>
                        <td className="px-6 py-3.5 text-slate-700">
                          Total da Rede ({networkTotals.totalEscolas} escolas)
                        </td>
                        <td className="px-6 py-3.5 text-right font-bold text-indigo-700">
                          {networkTotals.totalMatriculados > 0 ? networkTotals.totalMatriculados.toLocaleString('pt-BR') : '-'}
                        </td>
                        <td className="px-6 py-3.5 text-right font-bold text-emerald-700">
                          {networkTotals.totalPresentes > 0 ? networkTotals.totalPresentes.toLocaleString('pt-BR') : '-'}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2 text-sm font-bold text-slate-900">
                            {networkTotals.totalMatriculados > 0 ? (
                              <>
                                {networkTotals.mediaPonderada.toFixed(2)}%
                                <SemaforoBadge pct={networkTotals.mediaPonderada} type={activeTab} />
                              </>
                            ) : (
                              <span className="text-xs text-slate-400 font-normal">Sem matrículas</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-right"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Unified Batch Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0 rounded-t-xl">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                Importação Inteligente (Múltiplos Arquivos)
              </h2>
              <button onClick={closeUploadModal} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto grow bg-slate-50/50">
              {uploadStep === 1 && (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-slate-300 rounded-xl p-10 flex flex-col items-center justify-center text-center bg-white hover:bg-slate-50 transition-colors">
                    <UploadCloud className="w-12 h-12 text-indigo-400 mb-4" />
                    <p className="text-lg font-bold text-slate-700 mb-2">Selecione uma ou mais planilhas</p>
                    <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
                      Você pode arrastar e soltar vários arquivos .xlsx de uma vez. O sistema detectará a coluna de escolas e formatará as datas automaticamente.
                    </p>
                    <label className="flex items-center justify-center px-6 py-3 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer shadow-sm transition-colors">
                      <FileSpreadsheet className="w-5 h-5 mr-2" />
                      Escolher Arquivos
                      <input 
                        type="file" 
                        accept=".xlsx, .xls"
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </label>
                  </div>
                  {uploadError && <div className="text-sm text-center text-rose-600 font-medium">{uploadError}</div>}
                  {isProcessing && <div className="text-sm text-center text-indigo-600 flex justify-center items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Processando {uploadStats.fileCount} arquivo(s)...</div>}
                </div>
              )}

              {uploadStep === 2 && (
                <form id="mapping-form" onSubmit={handleImportSubmit} className="space-y-6">
                  {uploadError && (
                    <div className="bg-rose-50 text-rose-800 p-4 rounded-lg text-sm flex gap-3 border border-rose-100">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
                      <p className="font-medium">{uploadError}</p>
                    </div>
                  )}

                  <div className="bg-indigo-50 text-indigo-800 p-4 rounded-lg text-sm flex gap-3">
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Leitura concluída com sucesso!</p>
                      <p className="mt-0.5">Os arquivos foram consolidados. A coluna de Escolas foi detectada automaticamente e os períodos extraídos. Por favor, verifique se está tudo correto abaixo.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     {renderConfigPanel("Ensino Regular", "Regular", regularCfg, setRegularCfg)}
                     {renderConfigPanel("EJA", "EJA", ejaCfg, setEjaCfg)}
                  </div>
                </form>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0 rounded-b-xl">
              <button 
                type="button"
                onClick={closeUploadModal}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              {uploadStep === 2 && (
                <button 
                  form="mapping-form"
                  type="submit"
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar e Importar'}
                  {!isProcessing && <ChevronRight className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Evolution Modal */}
      {selectedSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSelectedSchool(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800 pr-8 line-clamp-1">
                {selectedSchool}
              </h2>
              <button onClick={() => setSelectedSchool(null)} className="text-slate-400 hover:text-slate-600 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <h3 className="text-sm font-medium text-slate-500 mb-6 uppercase tracking-wide flex justify-between items-center">
                Evolução Histórica
                <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold">{activeTab}</span>
              </h3>
              
              <div className="h-[350px] w-full">
                {selectedSchoolData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedSchoolData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="semana" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                      <RechartsTooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        cursor={{ fill: '#f8fafc' }}
                        formatter={(value: number) => [`${value.toFixed(2)}%`, 'Frequência']}
                      />
                      <Bar dataKey="porcentagem" radius={[4, 4, 0, 0]} barSize={50}>
                        {selectedSchoolData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={getSemaforoHex(entry.porcentagem, activeTab)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500">Sem dados históricos.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear Confirmation Modal */}
      {isClearConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full overflow-hidden p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Limpar dados?</h3>
            <p className="text-sm text-slate-500 mb-6">Tem certeza que deseja apagar todos os dados da aba <strong className="text-slate-800">{activeTab}</strong>? Esta ação não pode ser desfeita.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setIsClearConfirmOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">Cancelar</button>
              <button onClick={handleConfirmClear} className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-sm">Sim, limpar</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Period Confirmation Modal */}
      {isDeletePeriodConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full overflow-hidden p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Excluir período?</h3>
            <p className="text-sm text-slate-500 mb-6">Tem certeza que deseja excluir o período <strong>{selectedWeek}</strong> de <strong>{activeTab}</strong>?</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setIsDeletePeriodConfirmOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">Cancelar</button>
              <button onClick={handleConfirmDeletePeriod} className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-sm">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete School Confirmation Modal */}
      {isDeleteSchoolConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full overflow-hidden p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Excluir Escola?</h3>
            <p className="text-sm text-slate-500 mb-6">Tem certeza que deseja excluir todos os dados da escola <strong>{isDeleteSchoolConfirmOpen.escola}</strong> em <strong>{activeTab}</strong>?</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setIsDeleteSchoolConfirmOpen(null)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">Cancelar</button>
              <button onClick={handleConfirmDeleteSchool} className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-sm">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Record Modal */}
      {isEditRecordModalOpen && editRecordForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-indigo-500" /> Editar Registro
            </h3>
            <form onSubmit={handleEditRecordSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome da Escola</label>
                <input 
                  type="text" 
                  value={editRecordForm.escola}
                  onChange={e => setEditRecordForm({...editRecordForm, escola: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Frequência (%)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    max="100"
                    value={editRecordForm.porcentagem}
                    onChange={e => setEditRecordForm({...editRecordForm, porcentagem: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Período</label>
                  <input 
                    type="text" 
                    value={editRecordForm.semana}
                    onChange={e => setEditRecordForm({...editRecordForm, semana: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-3.5 space-y-2">
                <label className="block text-sm font-semibold text-indigo-950 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-600" />
                  Alunos Matriculados na Escola
                </label>
                <p className="text-xs text-slate-500">
                  Usado para o cálculo da média geral ponderada pelo porte da escola.
                </p>
                <input 
                  type="number" 
                  min="0"
                  placeholder="Ex: 250"
                  value={editRecordForm.matriculados || ''}
                  onChange={e => setEditRecordForm({...editRecordForm, matriculados: Math.max(0, parseInt(e.target.value, 10) || 0)})}
                  className="w-full px-3 py-2 border border-indigo-200 bg-white rounded-lg focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium"
                />
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input 
                    type="checkbox"
                    checked={editRecordForm.applyToAll}
                    onChange={e => setEditRecordForm({...editRecordForm, applyToAll: e.target.checked})}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-700 font-medium">
                    Aplicar este número de matrículas a todos os períodos desta escola
                  </span>
                </label>
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => { setIsEditRecordModalOpen(null); setEditRecordForm(null); }} 
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Single School Matricula Modal */}
      {quickMatriculaModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setQuickMatriculaModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full overflow-hidden p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" /> Matrículas da Escola
              </h3>
              <button onClick={() => setQuickMatriculaModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-1">{quickMatriculaModal.escola}</p>
            <p className="text-xs text-slate-500 mb-4">
              Informe a quantidade total de alunos para que a frequência desta escola seja ponderada corretamente na média geral ({activeTab}).
            </p>
            <form onSubmit={handleSaveQuickMatricula} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                  Número de Alunos Matriculados
                </label>
                <input 
                  type="number"
                  min="0"
                  autoFocus
                  placeholder="Ex: 350"
                  value={quickMatriculaModal.matriculados || ''}
                  onChange={e => setQuickMatriculaModal({...quickMatriculaModal, matriculados: Math.max(0, parseInt(e.target.value, 10) || 0)})}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800 text-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setQuickMatriculaModal(null)} 
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Matriculas Modal */}
      {isMatriculasModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full flex flex-col max-h-[90vh] overflow-hidden">
            
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">
                    Alunos Matriculados por Escola - {activeTab}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Insira o total de alunos para ponderar a média geral com justiça e precisão estatística.
                  </p>
                </div>
              </div>
              <button onClick={() => setIsMatriculasModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick summary stats bar & Filter */}
            <div className="p-4 border-b border-slate-200 bg-white shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-slate-500">Escolas: </span>
                  <strong className="text-slate-800">{matriculasList.length}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Total de Alunos Matriculados: </span>
                  <strong className="text-indigo-600">
                    {matriculasList.reduce((acc, m) => acc + (parseInt(String(m.matriculados), 10) || 0), 0).toLocaleString('pt-BR')}
                  </strong>
                </div>
              </div>

              <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input 
                  type="text" 
                  placeholder="Pesquisar escola..." 
                  value={matriculasFilter}
                  onChange={e => setMatriculasFilter(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Feedback notification */}
            {matriculasFeedback && (
              <div className={`mx-6 mt-4 p-3 rounded-lg text-sm flex items-center gap-2 shrink-0 ${matriculasFeedback.includes('sucesso') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{matriculasFeedback}</span>
              </div>
            )}

            {/* School list */}
            <div className="p-6 overflow-y-auto grow space-y-2">
              {matriculasList.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  Nenhuma escola encontrada para {activeTab}. Importe uma planilha primeiro.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {matriculasList
                    .filter(m => !matriculasFilter.trim() || m.escola.toLowerCase().includes(matriculasFilter.toLowerCase()))
                    .map((item) => (
                      <div key={item.escola} className="p-3 rounded-lg border border-slate-200 hover:border-indigo-300 bg-slate-50/50 hover:bg-white transition-all flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-slate-700 truncate flex-1" title={item.escola}>
                          {item.escola}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <label className="text-xs text-slate-400">Alunos:</label>
                          <input 
                            type="number" 
                            min="0"
                            placeholder="0"
                            value={item.matriculados || ''}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                              setMatriculasList(prev => prev.map(m => m.escola === item.escola ? { ...m, matriculados: val } : m));
                            }}
                            className="w-24 px-2.5 py-1.5 text-sm text-right font-semibold border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 bg-white"
                          />
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500">
                O valor informado é aplicado automaticamente para todos os períodos da escola.
              </span>
              <div className="flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsMatriculasModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Fechar
                </button>
                <button 
                  type="button"
                  onClick={handleSaveMatriculas}
                  disabled={isSavingMatriculas || matriculasList.length === 0}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  {isSavingMatriculas ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar Matrículas
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
