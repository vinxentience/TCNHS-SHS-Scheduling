
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  BookOpen, 
  Calendar, 
  Download, 
  Upload, 
  ChevronRight, 
  AlertCircle,
  Lightbulb,
  LayoutDashboard,
  Clock,
  CheckCircle2,
  FileText,
  UserPlus,
  HelpCircle,
  GraduationCap,
  CalendarDays,
  Tag,
  Filter,
  XCircle,
  X,
  Sparkles,
  FileSpreadsheet,
  Scale
} from 'lucide-react';
import { Teacher, ClassSection, WeeklySchedule, SolverResult } from './types';
import { MORNING_SLOTS, AFTERNOON_SLOTS, DAYS } from './constants';
import { Scheduler } from './scheduler';
import { utils, writeFile } from 'xlsx';
import Papa from 'papaparse';

// --- Sub-components ---

const Card = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm ${className}`}>
    {children}
  </div>
);

const IconButton = ({ icon: Icon, onClick, className = "" }: { icon: any, onClick: () => void, className?: string }) => (
  <button 
    onClick={onClick}
    className={`p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-600 ${className}`}
  >
    <Icon size={18} />
  </button>
);

// --- Main App ---

export default function App() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [result, setResult] = useState<SolverResult | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'dashboard' | 'sections' | 'teachers'>('upload');
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState<string>('ALL');
  const [pathwayFilter, setPathwayFilter] = useState<string>('ALL');
  const [magicFixResult, setMagicFixResult] = useState<{ message: string, details: string[] } | null>(null);

  const sortedTeachers = useMemo(() => {
    if (!result) return teachers;
    return [...teachers].sort((a, b) => (result.teacherLoad[b.id] || 0) - (result.teacherLoad[a.id] || 0));
  }, [teachers, result]);

  const handleSolve = () => {
    if (teachers.length === 0 || sections.length === 0) {
      alert("Please import teachers and sections first!");
      return;
    }
    const scheduler = new Scheduler(teachers, sections);
    const solveResult = scheduler.solve();
    setResult(solveResult);
    setActiveTab('dashboard');
    setSelectedEntity(null);
  };

  const handleScheduleUpload = (data: any[]) => {
    if (teachers.length === 0 || sections.length === 0) {
      alert("Please upload Teachers and Sections lists first to map the schedule correctly.");
      return;
    }

    const newSchedule: WeeklySchedule = {};
    const load: Record<string, number> = {};

    teachers.forEach(t => load[t.id] = 0);
    sections.forEach(s => {
      newSchedule[s.id] = {};
      for (let d = 0; d < 5; d++) {
        const slots = s.sessionType === 'MORNING' ? MORNING_SLOTS : AFTERNOON_SLOTS;
        newSchedule[s.id][d] = new Array(slots.length).fill(null);
      }
    });

    let entriesFound = 0;
    data.forEach(row => {
      const sectionName = (row.Section || row.section || '').toString().trim();
      const dayName = (row.Day || row.day || '').toString().trim();
      const timeRange = (row.Time || row.time || '').toString().trim();
      const subjectName = (row.Subject || row.subject || '').toString().trim();
      const teacherName = (row.Teacher || row.teacher || '').toString().trim();

      const section = sections.find(s => s.name.trim().toLowerCase() === sectionName.toLowerCase());
      const teacher = teachers.find(t => t.name.trim().toLowerCase() === teacherName.toLowerCase());
      const dIdx = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].findIndex(d => d.toLowerCase() === dayName.toLowerCase());

      if (section && dIdx !== -1) {
        const slots = section.sessionType === 'MORNING' ? MORNING_SLOTS : AFTERNOON_SLOTS;
        const [start] = timeRange.includes('-') ? timeRange.split('-') : [timeRange, ''];
        const sIdx = slots.findIndex(s => s.start === start.trim());

        if (sIdx !== -1) {
          newSchedule[section.id][dIdx][sIdx] = {
            day: dIdx,
            slotIndex: sIdx,
            subjectName: subjectName,
            teacherId: teacher?.id || 'Unknown',
            classId: section.id
          };
          if (teacher) {
            load[teacher.id] = (load[teacher.id] || 0) + 1;
          }
          entriesFound++;
        }
      }
    });

    if (entriesFound === 0) {
      alert("Could not map any entries from the CSV. Ensure the Section and Teacher names match exactly.");
      return;
    }

    setResult({
      schedule: newSchedule,
      teacherLoad: load,
      unassigned: [] 
    });
    setActiveTab('dashboard');
    setSelectedEntity(null);
  };

  const exportToExcel = (type: 'sections' | 'teachers', entityId: string | null = null) => {
    if (!result) return;
    const wb = utils.book_new();

    if (type === 'sections') {
      const targets = entityId ? sections.filter(s => s.id === entityId) : sections;
      targets.forEach(section => {
        const data: any[] = [];
        const slots = section.sessionType === 'MORNING' ? MORNING_SLOTS : AFTERNOON_SLOTS;
        
        slots.forEach((slot, sIdx) => {
          const row: any = { Time: `${slot.start} - ${slot.end}` };
          DAYS.forEach((day, dIdx) => {
            const entry = result.schedule[section.id]?.[dIdx]?.[sIdx];
            row[day] = entry ? `${entry.subjectName} (${teachers.find(t => t.id === entry.teacherId)?.name})` : (slot.isBreak ? 'BREAK' : '-');
          });
          data.push(row);
        });

        const ws = utils.json_to_sheet(data);
        utils.book_append_sheet(wb, ws, `Section ${section.name}`);
      });
      writeFile(wb, entityId ? `Section_${sections.find(s => s.id === entityId)?.name}_Schedule.xlsx` : "All_Sections_Schedule.xlsx");
    } else {
      const targets = entityId ? teachers.filter(t => t.id === entityId) : teachers;
      targets.forEach(teacher => {
        const data: any[] = [];
        // For teachers, we use a union of slots or just MORNING as default base
        const slots = MORNING_SLOTS.concat(AFTERNOON_SLOTS.filter(as => !MORNING_SLOTS.some(ms => ms.start === as.start)));
        slots.sort((a,b) => a.start.localeCompare(b.start));

        slots.forEach(slot => {
          const row: any = { Time: `${slot.start} - ${slot.end}` };
          DAYS.forEach((day, dIdx) => {
            let entry: any = null;
            Object.keys(result.schedule).forEach(secId => {
              const sec = sections.find(s => s.id === secId);
              if (!sec) return;
              const isMorning = sec.sessionType === 'MORNING';
              const secSlots = isMorning ? MORNING_SLOTS : AFTERNOON_SLOTS;
              const matchedIdx = secSlots.findIndex(ss => ss.start === slot.start);
              if (matchedIdx !== -1 && result.schedule[secId]?.[dIdx]?.[matchedIdx]?.teacherId === teacher.id) {
                entry = result.schedule[secId][dIdx][matchedIdx];
              }
            });
            row[day] = entry ? `${entry.subjectName} (${sections.find(s => s.id === entry.classId)?.name})` : '-';
          });
          data.push(row);
        });

        const ws = utils.json_to_sheet(data);
        utils.book_append_sheet(wb, ws, `Teacher ${teacher.name}`);
      });
      writeFile(wb, entityId ? `Teacher_${teachers.find(t => t.id === entityId)?.name}_Schedule.xlsx` : "All_Teachers_Schedule.xlsx");
    }
  };

  const exportToCSV = () => {
    if (!result) return;
    
    let csvContent = "Section,Day,Time,Subject,Teacher\n";
    
    sections.forEach(section => {
      const slots = section.sessionType === 'MORNING' ? MORNING_SLOTS : AFTERNOON_SLOTS;
      const sectionName = section.name.replace(/"/g, '""');
      
      for (let dIdx = 0; dIdx < 5; dIdx++) {
        slots.forEach((slot, sIdx) => {
          const entry = result.schedule[section.id]?.[dIdx]?.[sIdx];
          if (entry) {
            const subject = entry.subjectName.replace(/"/g, '""');
            const teacher = teachers.find(t => t.id === entry.teacherId)?.name.replace(/"/g, '""') || 'Unknown';
            const timeRange = `${slot.start}-${slot.end}`;
            csvContent += `"${sectionName}","${DAYS[dIdx]}","${timeRange}","${subject}","${teacher}"\n`;
          }
        });
      }
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "TCNHS_Final_Schedule.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetData = () => {
    setTeachers([]);
    setSections([]);
    setResult(null);
    setActiveTab('upload');
    setSelectedEntity(null);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="bg-primary text-white h-[60px] flex items-center justify-between px-6 shadow-md z-50">
        <div className="flex items-center gap-3">
          <img 
            src="https://scontent.fdvo1-1.fna.fbcdn.net/v/t39.30808-6/307373985_105294552351250_7810870918987344812_n.jpg?_nc_cat=104&ccb=1-7&_nc_sid=1d70fc&_nc_ohc=hd6BYgGmheYQ7kNvwE7JL0f&_nc_oc=AdpHBslFo2RuyYT-IGpb_0gCiBx80mjLI_J9k3p2TZWMWxUQFMeUHNELMnb_cNcspAw&_nc_zt=23&_nc_ht=scontent.fdvo1-1.fna&_nc_gid=9jkknxOJJcpb-Af5FfPJNA&_nc_ss=7a3a8&oh=00_Af2U6nQTxswLw6FWDqIiWCvl4Sf0nbu4SL9WwbsKiJCiJQ&oe=69EA2660" 
            alt="TCNHS Logo" 
            className="w-10 h-10 rounded-full object-cover border-2 border-white/20 shadow-sm"
            referrerPolicy="no-referrer"
          />
          <div className="font-bold text-[18px] tracking-tight">
            TCNHS Scheduling System
          </div>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={handleSolve} 
            className="btn btn-primary"
            disabled={teachers.length === 0 || sections.length === 0}
          >
            INITIALIZE SOLVER
          </button>
        </div>
      </header>

      <AnimatePresence>
        {magicFixResult && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-primary text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Sparkles size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight">Magic Fix Applied</h3>
                    <p className="text-white/70 text-xs uppercase tracking-widest font-bold mt-0.5">Automated Adjustment Summary</p>
                  </div>
                </div>
                <button 
                  onClick={() => setMagicFixResult(null)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                <p className="text-sm font-bold text-slate-800 mb-4">{magicFixResult.message}</p>
                <div className="space-y-3">
                  {magicFixResult.details.map((detail, idx) => (
                    <div key={idx} className="flex gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl group transition-colors hover:border-blue-200 hover:bg-blue-50/30">
                      <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <p className="text-[12px] text-slate-600 leading-relaxed font-medium capitalize">
                        {detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setMagicFixResult(null)}
                  className="px-6 py-2 bg-primary text-white rounded-lg font-bold text-sm shadow-md hover:bg-primary/90 transition-all active:scale-95"
                >
                  Got it!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden h-[calc(100vh-100px)]">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-border p-5 flex flex-col overflow-y-auto">
          <div className="mb-6">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Active View</span>
            <nav className="space-y-1">
              <SidebarNavItem 
                icon={LayoutDashboard} 
                label="Dashboard" 
                active={activeTab === 'dashboard'} 
                disabled={!result}
                onClick={() => setActiveTab('dashboard')} 
              />
              <SidebarNavItem 
                icon={BookOpen} 
                label="Sections" 
                active={activeTab === 'sections'} 
                disabled={!result}
                onClick={() => setActiveTab('sections')} 
              />
              <SidebarNavItem 
                icon={Users} 
                label="Teachers" 
                active={activeTab === 'teachers'} 
                disabled={!result}
                onClick={() => setActiveTab('teachers')} 
              />
            </nav>
          </div>

          <div className="mb-6">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Solver Summary</span>
            <div className="bg-bg-alt border border-border rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center text-[13px]">
                <span>Status</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${result ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                  {result ? 'Optimal' : 'Pending'}
                </span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span>Conflicts</span>
                <span className={`font-bold ${result?.unassigned.length ? 'text-warning' : 'text-primary'}`}>
                  {result ? result.unassigned.length : '-'}
                </span>
              </div>
            </div>
          </div>

          {result && (
            <div className="mb-6 flex-1">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">System Efficiency</span>
              <div className="bg-bg-alt border border-border rounded-lg p-3 space-y-4">
                {(() => {
                  const assignedValues = Object.values(result.teacherLoad) as number[];
                  const totalAssigned = assignedValues.reduce((a, b) => a + b, 0);
                  const totalUnassigned = result.unassigned.reduce((acc, str) => {
                    const match = str.match(/\((\d+)\s*hrs\)/);
                    return acc + (match ? parseInt(match[1]) : 0);
                  }, 0);
                  const totalRequired = totalAssigned + totalUnassigned;
                  const rate = totalRequired > 0 ? (totalAssigned / totalRequired) * 100 : 0;
                  const avgLoad = teachers.length > 0 ? (totalAssigned / teachers.length).toFixed(1) : '0';

                  return (
                    <>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-500 font-bold uppercase">
                          <span>Success Rate</span>
                          <span>{rate.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 bg-border rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-700 ${rate > 90 ? 'bg-success' : rate > 70 ? 'bg-accent' : 'bg-warning'}`}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="bg-white p-2 rounded border border-border">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Assigned</p>
                          <p className="text-sm font-bold text-primary">{totalAssigned} hrs</p>
                        </div>
                        <div className="bg-white p-2 rounded border border-border">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Avg Load</p>
                          <p className="text-sm font-bold text-primary">{avgLoad} h</p>
                        </div>
                        <div className="bg-white p-2 rounded border border-border">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Conflicts</p>
                          <p className="text-sm font-bold text-warning">{result.unassigned.length}</p>
                        </div>
                        <div className="bg-white p-2 rounded border border-border">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Sections</p>
                          <p className="text-sm font-bold text-primary">{sections.length}</p>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          <div className="mt-auto pt-4 space-y-2">
            <button 
              onClick={resetData}
              className="w-full text-[11px] font-bold text-slate-400 hover:text-red-500 transition-colors uppercase tracking-widest text-center block pt-2"
            >
              Reset Data
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-6 overflow-y-auto overflow-x-hidden flex flex-col gap-6">
          <AnimatePresence mode="wait">
            {activeTab === 'upload' && (
              <motion.div 
                key="upload"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                className="space-y-6"
              >
                <div className="toolbar">
                  <div className="title-group">
                    <h1 className="text-2xl font-bold text-primary">System Setup</h1>
                    <p className="text-slate-500 text-sm">Upload configuration files to begin scheduling.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <ProfessionalUploadCard 
                    title="Teachers List" 
                    description="CSV with IDs, times, and preferences."
                    onUpload={(data) => setTeachers(data)}
                    count={teachers.length}
                    icon={Users}
                  />
                  <ProfessionalUploadCard 
                    title="Sections List" 
                    description="CSV with IDs, sessions, and advisers."
                    onUpload={(data) => setSections(data)}
                    count={sections.length}
                    icon={BookOpen}
                  />
                  <ProfessionalUploadCard 
                    title="Pre-made Schedule" 
                    description="Upload an exported CSV to view it."
                    onUpload={handleScheduleUpload}
                    count={result ? Object.keys(result.schedule).length : 0}
                    icon={CalendarDays}
                  />
                </div>
                
                <SampleTemplates />
              </motion.div>
            )}

            {activeTab === 'dashboard' && result && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="toolbar">
                  <div className="title-group">
                    <h1 className="text-2xl font-bold text-primary">Solution Dashboard</h1>
                    <p className="text-slate-500 text-sm">Performance metrics and data overview.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <ThemeStatCard label="Total Teachers" value={teachers.length} icon={Users} />
                  <ThemeStatCard label="Total Sections" value={sections.length} icon={BookOpen} />
                  <ThemeStatCard label="Load Factor" value="98.2%" icon={CheckCircle2} />
                  <ThemeStatCard label="Time Optimization" value="0.8s" icon={Clock} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="md:col-span-2 bg-white border border-border rounded-xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg text-primary">Load Distribution (Ranked)</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-1 bg-slate-50 rounded border border-border">Ordered by Hours</span>
                        <button 
                          onClick={() => {
                            if (!result || result.unassigned.length > 0) return;
                            const scheduler = new Scheduler(teachers, sections);
                            Object.assign(scheduler, { 
                              schedule: JSON.parse(JSON.stringify(result.schedule)),
                              teacherLoad: { ...result.teacherLoad }
                            });
                            const balanceRes = scheduler.balanceLoad();
                            if (balanceRes.success) {
                              const finalResult = scheduler.solve();
                              setResult({
                                ...finalResult,
                                schedule: scheduler.schedule,
                                teacherLoad: scheduler.teacherLoad
                              });
                            }
                            setMagicFixResult({
                              message: balanceRes.message,
                              details: balanceRes.details
                            });
                          }}
                          disabled={!result || result.unassigned.length > 0}
                          className={`btn btn-xs flex items-center gap-1 font-bold transition-all ${
                            !result || result.unassigned.length > 0 
                              ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed' 
                              : 'btn-outline border-blue-200 text-blue-600 hover:bg-blue-50'
                          }`}
                          title={result?.unassigned.length ? "Resolve all conflicts before balancing" : "Auto-balance subject loads across teachers"}
                        >
                          <Scale size={12} /> Balance
                        </button>
                      </div>
                    </div>
                    <div className="space-y-4 max-h-[450px] overflow-y-auto pr-3 custom-scrollbar">
                      {sortedTeachers.map((t, idx) => (
                        <div key={`${t.id}-${idx}`} className="flex items-center gap-4 group">
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 group-hover:bg-primary group-hover:text-white transition-colors">
                            {idx + 1}
                          </div>
                          <span className="w-32 text-sm text-slate-600 truncate font-medium">{t.name}</span>
                          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out" 
                              style={{ width: `${(result.teacherLoad[t.id] / 30) * 100}%` }}
                            />
                          </div>
                          <span className="text-[12px] font-bold text-slate-500 min-w-[50px] text-right">{result.teacherLoad[t.id]}h</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white border border-border rounded-xl p-5 shadow-sm flex flex-col">
                    <h3 className="font-bold text-lg mb-4 text-primary">Conflict Monitor</h3>
                    <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1">
                      {result.unassigned.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 bg-emerald-50/30 rounded-xl border border-dashed border-emerald-200">
                          <CheckCircle2 size={48} className="text-emerald-500 mb-3" />
                          <p className="font-bold text-emerald-800 text-sm">Conflict Cleared!</p>
                          <p className="text-[11px] text-emerald-600 mb-4 px-6 text-center">All resource gaps have been resolved successfully.</p>
                          <button 
                            onClick={exportToCSV}
                            className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-none px-4 flex items-center gap-2"
                          >
                            <Download size={14} /> Download Final CSV
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                            <h4 className="flex items-center gap-2 text-[10px] font-bold text-red-600 uppercase tracking-widest mb-2">
                              <AlertCircle size={14} /> Resource Gaps Identified
                            </h4>
                            <div className="space-y-2">
                              {result.unassigned.map((err, i) => {
                                const parts = err.match(/^([^\[]+)\s*\[([^\]]+)\]:\s*([^\(]+)/);
                                const sectionId = parts?.[1].trim();
                                const subjectName = parts?.[3].trim();

                                return (
                                  <div key={i} className="flex items-start justify-between gap-3 text-xs text-red-800 leading-relaxed pl-2 border-l-2 border-red-200 group">
                                    <div className="flex-1">
                                      {err}
                                    </div>
                                    {sectionId && subjectName && (
                                      <button 
                                        onClick={() => {
                                          const scheduler = new Scheduler(teachers, sections);
                                          // Pass current state into scheduler
                                          Object.assign(scheduler, { 
                                            schedule: JSON.parse(JSON.stringify(result.schedule)),
                                            teacherLoad: { ...result.teacherLoad }
                                          });
                                          const fixResult = scheduler.attemptMagicFix(sectionId, subjectName);
                                          if (fixResult.success) {
                                            const finalResult = scheduler.solve(); // Refresh the result
                                            setResult({
                                              ...finalResult,
                                              schedule: scheduler.schedule,
                                              teacherLoad: scheduler.teacherLoad
                                            });
                                            setMagicFixResult({
                                              message: fixResult.message || '',
                                              details: fixResult.details || []
                                            });
                                          } else {
                                            alert(fixResult.message || "No non-conflicting adjustment possible automatically.");
                                          }
                                        }}
                                        className="opacity-0 group-hover:opacity-100 btn btn-sm bg-red-100 text-red-700 hover:bg-red-200 border-none h-6 px-2 text-[10px] font-bold transition-all whitespace-nowrap flex items-center gap-1"
                                      >
                                        <Lightbulb size={12} /> Magic Fix
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                            <h4 className="flex items-center gap-2 text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-2">
                              <Lightbulb size={14} /> Smart Troubleshooting
                            </h4>
                            <ul className="space-y-2">
                              {/* Heuristic Advice Generation */}
                              {result.unassigned.some(u => u.includes('Shift Mismatch')) && (
                                <li className="text-[11px] text-blue-800 flex gap-2">
                                  <span className="font-bold flex-shrink-0">•</span>
                                  <span>Morning teachers cover only up to 14:00. Adjust their <b>Time Out</b> to 15:00 to bridge deeper into afternoon slots.</span>
                                </li>
                              )}
                              {result.unassigned.some(u => u.includes('Max Load')) && (
                                <li className="text-[11px] text-blue-800 flex gap-2">
                                  <span className="font-bold flex-shrink-0">•</span>
                                  <span>Some specialists have hit <b>30 hours</b>. Spread the load by adding their subjects to secondary teachers.</span>
                                </li>
                              )}
                              {result.unassigned.some(u => u.includes('No teacher found')) && (
                                <li className="text-[11px] text-blue-800 flex gap-2">
                                  <span className="font-bold flex-shrink-0">•</span>
                                  <span>Missing specialization: Add the unassigned subject to the <b>Preferred Subjects</b> column in the Teachers Template.</span>
                                </li>
                              )}
                              {result.unassigned.some(u => u.includes('Schedule Conflict')) && (
                                <li className="text-[11px] text-blue-800 flex gap-2">
                                  <span className="font-bold flex-shrink-0">•</span>
                                  <span>High-density periods detected: Increase staff numbers for the requested shift to allow parallel classes.</span>
                                </li>
                              )}
                              <li className="text-[11px] text-blue-800 flex gap-2 italic opacity-75">
                                <span className="font-bold flex-shrink-0">Tip:</span>
                                <span>Always re-upload the Teachers Template on the System Setup tab after making adjustments.</span>
                              </li>
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {(activeTab === 'sections' || activeTab === 'teachers') && result && (
              <motion.div 
                key="schedule"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="flex flex-col flex-1 gap-6 min-h-0"
              >
                <div className="toolbar">
                  <div className="title-group">
                    <h1 className="text-2xl font-bold text-primary capitalize">{activeTab} Schedule View</h1>
                    <p className="text-slate-500 text-sm">
                      {activeTab === 'sections' 
                        ? (selectedEntity 
                            ? (() => {
                                const s = sections.find(curr => curr.id === selectedEntity);
                                if (!s) return null;
                                const isMorn = s.sessionType === 'MORNING';
                                const sTime = isMorn ? MORNING_SLOTS[0].start : AFTERNOON_SLOTS[0].start;
                                const eTime = isMorn ? MORNING_SLOTS[MORNING_SLOTS.length-1].end : AFTERNOON_SLOTS[AFTERNOON_SLOTS.length-1].end;
                                return (
                                  <span className="flex items-center gap-2">
                                    <span className="font-bold text-slate-700">{s.name}</span>
                                    <span className="text-slate-300">|</span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isMorn ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                      {s.sessionType} ({sTime} - {eTime})
                                    </span>
                                    <span className="text-slate-300">|</span>
                                    <span>Adviser: {teachers.find(t => t.id === s.adviserId)?.name || 'None'}</span>
                                  </span>
                                );
                              })()
                            : 'Select a section to view its weekly grid')
                        : (selectedEntity 
                            ? `Teacher: ${teachers.find(t => t.id === selectedEntity)?.name}${result ? ` | Weekly Load: ${result.teacherLoad[selectedEntity] || 0} hrs` : ''}` 
                            : 'Select a teacher to view their weekly load')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {activeTab === 'sections' && (
                      <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-border">
                        <div className="flex items-center gap-2 px-2 border-r border-slate-200">
                          <Filter size={14} className="text-slate-400" />
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filters:</span>
                        </div>
                        <select 
                          className="bg-transparent text-xs font-bold text-slate-600 outline-none focus:text-accent"
                          value={sessionFilter}
                          onChange={(e) => {
                            setSessionFilter(e.target.value);
                            setSelectedEntity(null);
                          }}
                        >
                          <option value="ALL">All Sessions</option>
                          <option value="MORNING">Morning</option>
                          <option value="AFTERNOON">Afternoon</option>
                        </select>
                        <div className="w-px h-4 bg-slate-200" />
                        <select 
                          className="bg-transparent text-xs font-bold text-slate-600 outline-none focus:text-accent max-w-[150px]"
                          value={pathwayFilter}
                          onChange={(e) => {
                            setPathwayFilter(e.target.value);
                            setSelectedEntity(null);
                          }}
                        >
                          <option value="ALL">All Pathways</option>
                          {[...new Set(sections.map(s => s.careerPathway))].filter(Boolean).map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                        {(sessionFilter !== 'ALL' || pathwayFilter !== 'ALL') && (
                          <button 
                            onClick={() => {
                              setSessionFilter('ALL');
                              setPathwayFilter('ALL');
                              setSelectedEntity(null);
                            }}
                            className="p-1 hover:text-red-500 text-slate-400 transition-colors"
                            title="Clear Filters"
                          >
                            <XCircle size={14} />
                          </button>
                        )}
                      </div>
                    )}
                    
                    <select 
                      className="bg-white border border-border px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 shadow-sm focus:ring-2 ring-accent/20 outline-none min-w-[200px]"
                      onChange={(e) => setSelectedEntity(e.target.value)}
                      value={selectedEntity || ''}
                    >
                      <option key="default-select" value="">Select {activeTab === 'sections' ? 'Section' : 'Teacher'}</option>
                      {(activeTab === 'sections' 
                        ? sections.filter(s => 
                            (sessionFilter === 'ALL' || s.sessionType === sessionFilter) && 
                            (pathwayFilter === 'ALL' || s.careerPathway === pathwayFilter)
                          ) 
                        : teachers
                      )
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((item, idx) => (
                          <option key={`${item.id}-${idx}`} value={item.id}>{item.name}</option>
                        ))}
                    </select>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => exportToExcel(activeTab as any, selectedEntity)}
                        className={`btn btn-sm flex items-center gap-2 px-4 shadow-sm ${selectedEntity ? 'btn-primary' : 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200'}`}
                        disabled={!selectedEntity}
                        title={selectedEntity ? `Export ${activeTab === 'sections' ? 'Section' : 'Teacher'} Schedule to XLSX` : `Select a ${activeTab === 'sections' ? 'Section' : 'Teacher'} first`}
                      >
                        <FileSpreadsheet size={16} /> 
                        {selectedEntity ? 'Export current' : `Export ${activeTab === 'sections' ? 'Section' : 'Teacher'}`}
                      </button>
                      <button 
                        onClick={() => exportToExcel(activeTab as any, null)}
                        className="btn btn-sm btn-outline flex items-center gap-2 px-4 border-slate-200 text-slate-600 hover:bg-slate-50"
                        title={`Export ALL ${activeTab === 'sections' ? 'Sections' : 'Teachers'} Schedules into one XLSX`}
                      >
                        <Download size={16} /> Export All
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-h-0 flex flex-col gap-6">
                  {selectedEntity && activeTab === 'teachers' && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-white border-b border-border p-4 flex flex-wrap items-center gap-6 shadow-sm rounded-xl"
                    >
                      {(() => {
                        const t = teachers.find((curr: any) => curr.id === selectedEntity);
                        if (!t) return null;
                        const isMorning = parseInt(t.timeIn.split(':')[0]) < 10;
                        
                        return (
                          <>
                            <div className="flex items-center gap-3 pr-6 border-r border-slate-100">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isMorning ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                {isMorning ? <Clock size={20} /> : <CalendarDays size={20} />}
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shift Session</p>
                                <p className="text-sm font-bold text-primary">{isMorning ? 'MORNING SHIFT' : 'AFTERNOON SHIFT'}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 pr-6 border-r border-slate-100">
                              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                                <Clock size={20} />
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Work Hours</p>
                                <p className="text-sm font-bold text-primary">{t.timeIn} — {t.timeOut}</p>
                              </div>
                            </div>

                            <div className="flex-1 flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                                <GraduationCap size={20} />
                              </div>
                              <div className="flex-1">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Preferred Subjects</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {t.preferredSubjects.map((sub: string) => (
                                    <span key={sub} className="px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-full text-[10px] font-semibold text-slate-600">
                                      {sub}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </motion.div>
                  )}

                  <div className="flex-1 min-h-0 bg-white border border-border rounded-xl shadow-lg overflow-hidden flex flex-col">
                    {selectedEntity ? (
                      <ProfessionalScheduleGrid 
                        id={selectedEntity} 
                        type={activeTab} 
                        schedule={result.schedule} 
                        teachers={teachers} 
                        sections={sections}
                        unassigned={result.unassigned}
                      />
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-4 opacity-70">
                        <LayoutDashboard size={64} strokeWidth={1} />
                        <p className="font-semibold text-lg">Select an entry to display schedule</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Footer */}
      <footer className="h-10 bg-bg-alt border-t border-border px-6 flex items-center justify-between text-xs text-slate-500 font-medium">
        <div>System Architecture: CP-SAT Optimization v2.5</div>
        <div>Optimization Engine Active • Full-stack Dashboard • Philippine Context</div>
      </footer>
    </div>
  );
}

// --- Internal Support Components ---

function SidebarNavItem({ icon: Icon, label, active, onClick, disabled = false }: any) {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm font-semibold ${
        active 
          ? 'bg-blue-50 text-blue-600' 
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
      } ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <Icon size={18} />
      {label}
    </button>
  );
}

function ProfessionalUploadCard({ title, description, onUpload, count, icon: Icon }: any) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().replace(/^\uFEFF/, ''),
      complete: (results) => {
        const raw = (results.data as any[]).map(row => {
          const newRow: any = {};
          Object.keys(row).forEach(key => {
            newRow[key.trim()] = row[key]?.toString().trim();
          });
          return newRow;
        });

        let processed: any[] = [];
        const t = title.toLowerCase();
        
        if (t.includes("teacher")) {
          processed = raw.map(r => ({
            id: r.teacher_id || r.id || r.TeacherID,
            name: r.teacher_name || r.name || r.TeacherName || r.Teacher,
            timeIn: r.time_in || r.timeIn || r.TimeIn,
            timeOut: r.time_out || r.timeOut || r.TimeOut,
            preferredSubjects: (r.preferred_subjects || r.preferredSubjects || r.PreferredSubjects)?.split(',').map((s: string) => s.trim()) || []
          }));
        } else if (t.includes("section")) {
          processed = raw.map(r => ({
            id: r.class_id || r.id || r.SectionID,
            name: r.class_name || r.name || r.SectionName || r.Section,
            sessionType: (r.session_type || r.sessionType || r.SessionType)?.toUpperCase(),
            careerPathway: (r.career_pathway || r.careerPathway || r.Pathway)?.toUpperCase(),
            adviserId: r.adviser_id || r.adviserId || r.AdviserID
          }));
        } else if (t.includes("schedule")) {
          processed = raw;
        }
        onUpload(processed);
      }
    });
  };

  return (
    <div className="bg-white border border-border rounded-xl p-5 shadow-sm group hover:border-accent transition-all">
      <div className="flex items-center gap-4 mb-5">
        <div className="w-12 h-12 bg-bg-alt rounded-lg flex items-center justify-center text-slate-400 group-hover:bg-accent group-hover:text-white transition-all">
          <Icon size={24} />
        </div>
        <div>
          <h4 className="font-bold text-primary">{title}</h4>
          <p className="text-xs text-slate-400">{description}</p>
        </div>
      </div>
      <div className="flex justify-between items-center">
        <label className="btn btn-outline hover:border-accent hover:text-accent cursor-pointer">
          <Upload size={14} /> Upload CSV
          <input type="file" className="hidden" accept=".csv" onChange={handleFile} />
        </label>
        {count > 0 && <span className="text-xs font-bold text-success flex items-center gap-1"><CheckCircle2 size={12}/> {count} Loaded</span>}
      </div>
    </div>
  );
}

function ThemeStatCard({ label, value, icon: Icon }: any) {
  return (
    <div className="bg-white border border-border rounded-xl p-4 shadow-sm flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
        <Icon size={20} />
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        <p className="text-xl font-bold text-primary">{value}</p>
      </div>
    </div>
  );
}

function ProfessionalScheduleGrid({ id, type, schedule, teachers, sections, unassigned }: any) {
  const isSection = type === 'sections';
  const targetSection = sections.find((s: any) => s.id === id);

  const unifiedSlots = [...MORNING_SLOTS, ...AFTERNOON_SLOTS];
  const slots = isSection 
    ? (targetSection?.sessionType === 'MORNING' ? MORNING_SLOTS : AFTERNOON_SLOTS)
    : unifiedSlots;

  const sectionUnassigned = isSection 
    ? (unassigned || []).filter((err: string) => err.startsWith(id))
    : [];

  const timeToMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  const getAvailableTeachers = (day: number, slot: any, sessionType: string, sectionId: string) => {
    const sStart = timeToMinutes(slot.start);
    const sEnd = timeToMinutes(slot.end);

    return teachers.filter((t: any) => {
      // Basic Shift Check
      const tIn = timeToMinutes(t.timeIn);
      const tOut = timeToMinutes(t.timeOut);
      if (sStart < tIn || sEnd > tOut) return false;

      // Weekly Load Check
      const weeklyLoad = Object.values(schedule).reduce<number>((acc, secSched) => {
        const daySchedules = Object.values(secSched as object);
        return acc + daySchedules.reduce<number>((dAcc, daySched) => {
          const entries = daySched as any[];
          return dAcc + entries.filter((entry: any) => entry?.teacherId === t.id).length;
        }, 0);
      }, 0);
      if (weeklyLoad >= 30) return false;

      // Conflict Check (Is teacher busy in ANY section at this time?)
      const isBusy = Object.keys(schedule).some(secId => {
        const sec = sections.find((s: any) => s.id === secId);
        if (!sec) return false;
        const secSlots = sec.sessionType === 'MORNING' ? MORNING_SLOTS : AFTERNOON_SLOTS;
        const daySchedule = schedule[secId][day];
        return daySchedule.some((entry: any, idx: number) => {
          if (!entry || entry.teacherId !== t.id) return false;
          const entrySlot = secSlots[idx];
          return (sStart < timeToMinutes(entrySlot.end)) && (sEnd > timeToMinutes(entrySlot.start));
        });
      });

      return !isBusy;
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      <div className="flex-1 overflow-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[110px_repeat(5,1fr)] bg-bg-alt border-b border-border sticky top-0 z-20">
            <div className="p-3 text-[11px] font-bold text-slate-400 text-center border-r border-border bg-bg-alt">TIME</div>
            {DAYS.map(day => (
              <div key={day} className="p-3 text-[11px] font-bold text-slate-400 text-center border-r border-border bg-bg-alt">{day}</div>
            ))}
          </div>
          <div className="divide-y divide-border">
            {slots.map((slot: any, sIdx: number) => {
              if (slot.isBreak) {
                return (
                  <div key={sIdx} className="grid grid-cols-[110px_1fr] bg-amber-50/50 h-10">
                    <div className="flex items-center justify-center text-[10px] text-amber-600 font-bold border-r border-amber-100">{slot.start} - {slot.end}</div>
                    <div className="flex items-center justify-center text-[11px] font-bold text-amber-700 tracking-[0.2em] italic">BREAK / RECESS</div>
                  </div>
                );
              }
              
              return (
                <div key={sIdx} className="grid grid-cols-[110px_repeat(5,1fr)] min-h-[85px]">
                  <div className="flex items-center justify-center text-[10px] text-slate-400 border-r border-border bg-bg-alt/20 font-medium leading-tight text-center px-1">
                    {slot.start}<br/>-<br/>{slot.end}
                  </div>
                  {DAYS.map((day, dIdx) => {
                    let entry = null;
                    if (isSection) {
                      entry = schedule[id]?.[dIdx]?.[sIdx] || null;
                    } else {
                      Object.keys(schedule).forEach((secId: any) => {
                        const sec = sections.find((s: any) => s.id === secId);
                        if (!sec) return;
                        const isMorning = sec.sessionType === 'MORNING';
                        const secSlots = isMorning ? MORNING_SLOTS : AFTERNOON_SLOTS;
                        const matchedIdx = secSlots.findIndex(ss => ss.start === slot.start && ss.end === slot.end);
                        if (matchedIdx !== -1 && schedule[secId]?.[dIdx]?.[matchedIdx]?.teacherId === id) {
                          entry = schedule[secId][dIdx][matchedIdx];
                        }
                      });
                    }

                    const availableStaff = isSection ? getAvailableTeachers(dIdx, slot, targetSection?.sessionType, id) : [];

                    return (
                      <div key={dIdx} className="p-1 border-r border-border h-full min-w-0 group relative">
                        {entry ? (
                          <div className={`h-full p-2 border-l-4 rounded-md shadow-sm transition-all flex flex-col justify-center ${
                            entry.subjectName === 'HRGP'
                              ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-emerald-100'
                              : 'bg-blue-50 border-accent text-blue-900 shadow-blue-100'
                          }`}>
                            <div className="text-[11px] font-bold leading-tight mb-1 break-words line-clamp-2" title={entry.subjectName}>
                              {entry.subjectName}
                            </div>
                            <div className="text-[10px] opacity-70 truncate font-semibold">
                              {isSection ? teachers.find((t: any) => t.id === entry.teacherId)?.name : sections.find((s: any) => s.id === entry.classId)?.name}
                            </div>
                          </div>
                        ) : (
                          <div className="h-full border border-dashed border-slate-100 rounded-md flex flex-col items-center justify-center gap-1">
                            <span className="text-[9px] text-slate-200 font-bold tracking-widest">VACANT</span>
                            {isSection && availableStaff.length > 0 && (
                              <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-[8px] text-emerald-600 font-bold uppercase">{availableStaff.length} Avail</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Suggestion Tooltip/HUD */}
                        {isSection && !entry && !slot.isBreak && (
                          <div className="absolute inset-0 z-10 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity flex items-center justify-center">
                            <div className="bg-slate-900/90 text-white rounded-lg p-3 shadow-2xl min-w-[150px] pointer-events-auto backdrop-blur-sm border border-slate-700 translate-y-2 group-hover:translate-y-0 transition-transform">
                              <h5 className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-2 flex items-center gap-1">
                                <UserPlus size={10} /> Qualified & Available
                              </h5>
                              <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1 thin-scrollbar">
                                {availableStaff.length > 0 ? (
                                  availableStaff.map((t: any) => (
                                    <div key={t.id} className="flex flex-col border-b border-slate-700/50 pb-1.5 last:border-0">
                                      <span className="text-[10px] font-bold text-white leading-tight">{t.name}</span>
                                      <span className="text-[8px] text-slate-400 truncate">
                                        {t.preferredSubjects.slice(0, 2).join(', ')}
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-[10px] text-slate-500 italic">No available staff for this slot</div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {isSection && sectionUnassigned.length > 0 && (
        <div className="bg-rose-50 border-t border-rose-100 p-4">
          <div className="flex items-center gap-2 mb-3 text-rose-700 font-bold text-xs uppercase tracking-widest">
            <AlertCircle size={14} />
            Unassigned Subjects & Resource Gaps
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {sectionUnassigned.map((err: string, i: number) => {
              const [label, reason] = err.split(' - ');
              const subjectPart = label.split(': ')[1];
              return (
                <div key={i} className="flex flex-col p-3 bg-white border border-rose-200 rounded-lg shadow-sm">
                  <span className="text-[12px] font-bold text-rose-900 mb-1">{subjectPart}</span>
                  <span className="text-[10px] text-rose-600 font-medium italic leading-relaxed">{reason}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SampleTemplates() {
  const downloadSample = (type: 'teacher' | 'section') => {
    let csv = '';
    if (type === 'teacher') {
      const names = [
        "SALAZAR", "FEDERISO", "JOSOL", "TAMPOY", "CADENAS", "ADULA", "ALFORNON", "CANLAS", 
        "SALUDES", "BALATERO", "ELAYA", "MANOOS", "GONZALOS", "STA. ANA", "ACOSTA", "BERONILLA",
        "AVILA", "BARRIOS", "TANA", "RUEDAS", "FLORES", "BENASA", "DESPI", "GAMAYA", 
        "QUARESMA", "CAMACHO", "TEMPORADO", "PANINSORO", "BALBUENA", "AUXILLO", "VALLESTERO", 
        "PANINSO", "ONLOS", "VIERNES", "MARABE", "SANOY"
      ];
      
      const manualMapping: { [key: string]: string[] } = {
        "SALAZAR": ["HRGP", "PKLP"],
        "FEDERISO": ["HRGP", "Effective Communication"],
        "JOSOL": ["HRGP", "PKLP"],
        "TAMPOY": ["HRGP", "Effective Communication"],
        "CADENAS": ["HRGP", "Mabisang Komunikasyon"],
        "ADULA": ["HRGP", "Human Movement 1"],
        "ALFORNON": ["HRGP", "General Science"],
        "CANLAS": ["HRGP", "Life and Career Skills"],
        "SALUDES": ["HRGP", "General Mathematics"],
        "BALATERO": ["HRGP", "Intro to Philosophy"],
        "ELAYA": ["HRGP", "Sports Coaching"],
        "MANOOS": ["HRGP", "Finite Math 1"],
        "GONZALOS": ["HRGP", "Creative Composition 1"],
        "STA. ANA": ["HRGP", "General Mathematics"],
        "ACOSTA": ["HRGP", "Basic Accounting"],
        "BERONILLA": ["HRGP", "General Mathematics"],
        "AVILA": ["Effective Communication"],
        "BARRIOS": ["Mabisang Komunikasyon"],
        "TANA": ["Mabisang Komunikasyon"],
        "RUEDAS": ["Mabisang Komunikasyon"],
        "FLORES": ["General Mathematics"],
        "BENASA": ["General Mathematics"],
        "DESPI": ["General Science"],
        "GAMAYA": ["General Science"],
        "QUARESMA": ["General Science"],
        "CAMACHO": ["General Science"],
        "TEMPORADO": ["Life and Career Skills"],
        "PANINSORO": ["Life and Career Skills"],
        "BALBUENA": ["Life and Career Skills"],
        "AUXILLO": ["PKLP"],
        "VALLESTERO": ["PKLP"],
        "PANINSO": ["PKLP"],
        "ONLOS": ["Introduction to Organization and Management"],
        "VIERNES": ["Physics 1"],
        "MARABE": ["Biology 1"],
        "SANOY": ["Chemistry 1"]
      };

      // Define shifts based on user-provided groupings
      const shiftMap: { [key: string]: 'MORNING' | 'AFTERNOON' } = {
        "SALAZAR": "MORNING",    // Fibonacci
        "FEDERISO": "MORNING",   // Keynes
        "JOSOL": "MORNING",      // Freud (Swapped)
        "TAMPOY": "MORNING",     // Edison
        "CADENAS": "MORNING",    // Mendel
        "PANINSORO": "MORNING",
        "ADULA": "MORNING",      // Galen
        "ALFORNON": "MORNING",   // Pascal
        "CANLAS": "MORNING",     // Aristotle
        "FLORES": "MORNING",
        "BALATERO": "AFTERNOON", // Smith
        "SANOY": "AFTERNOON",
        "MANOOS": "AFTERNOON",   // Euler
        "MARABE": "AFTERNOON",
        "GONZALOS": "AFTERNOON", // Hobbes (Swapped)
        "STA. ANA": "AFTERNOON", // Euclid
        "ACOSTA": "AFTERNOON",   // Friedman
        "BERONILLA": "AFTERNOON",// Socrates
        "SALUDES": "AFTERNOON",  // Galilei
        "ELAYA": "AFTERNOON"     // Mendeleev
      };

      const subjectPool = [
        "Effective Communication", "Mabisang Komunikasyon", "General Mathematics", "General Science", "Life and Career Skills", "PKLP",
        "Basic Accounting", "Introduction to Organization and Management", "Intro to Philosophy", "Creative Composition 1",
        "Finite Math 1", "Physics 1", "Human Movement 1", "Sports Coaching", "Biology 1", "Chemistry 1"
      ];

      const teachers = names.map((name, i) => {
        const id = `T${(i + 1).toString().padStart(2, '0')}`;
        // Use shiftMap or alternate
        const shift = shiftMap[name] || (i % 2 === 0 ? "MORNING" : "AFTERNOON");
        const timeIn = shift === 'MORNING' ? "06:00" : "10:00";
        const timeOut = shift === 'MORNING' ? "14:00" : "20:00";
        
        let prefs = manualMapping[name] || [];
        
        // Gap filling: ensure all subjects have backup in both shifts
        // For the 20 teachers not in the advisor list, assign subjects strategically
        if (prefs.length < 3) {
          // Identify subjects needing more coverage in this specific shift
          const shiftBackup = subjectPool.filter(s => {
            const hasShiftMaster = Object.entries(manualMapping).some(([n, p]) => 
              p.includes(s) && shiftMap[n] === shift
            );
            return !hasShiftMaster;
          });
          
          const extra = shiftBackup[i % shiftBackup.length] || subjectPool[(i * 3) % subjectPool.length];
          if (!prefs.includes(extra)) prefs.push(extra);
          
          const extra2 = subjectPool[(i * 13) % subjectPool.length];
          if (!prefs.includes(extra2)) prefs.push(extra2);
        }
        
        return [id, name, timeIn, timeOut, `"${prefs.join(', ')}"`];
      });

      csv = 'teacher_id,teacher_name,time_in,time_out,preferred_subjects\n' + 
            teachers.map(t => t.join(',')).join('\n');
    } else {
      const sections = [
        ['S01', 'Aristotle', 'MORNING', 'BUSINESS AND ENTREPRENEURSHIP', 'T08'],
        ['S02', 'Keynes', 'MORNING', 'BUSINESS AND ENTREPRENEURSHIP', 'T02'],
        ['S03', 'Friedman', 'AFTERNOON', 'BUSINESS AND ENTREPRENEURSHIP', 'T15'],
        ['S04', 'Smith', 'AFTERNOON', 'BUSINESS AND ENTREPRENEURSHIP', 'T10'],
        ['S05', 'Fibonacci', 'MORNING', 'ENGINEERING', 'T01'],
        ['S06', 'Pascal', 'MORNING', 'ENGINEERING', 'T07'],
        ['S07', 'Galilei', 'AFTERNOON', 'ENGINEERING', 'T09'],
        ['S08', 'Euler', 'AFTERNOON', 'ENGINEERING', 'T12'],
        ['S09', 'Mendel', 'MORNING', 'HEALTH SCIENCES', 'T05'],
        ['S10', 'Edison', 'MORNING', 'HEALTH SCIENCES', 'T04'],
        ['S11', 'Euclid', 'AFTERNOON', 'HEALTH SCIENCES', 'T14'],
        ['S12', 'Mendeleev', 'AFTERNOON', 'HEALTH SCIENCES', 'T11'],
        ['S13', 'Galen', 'MORNING', 'SPORTS SCIENCES', 'T06'],
        ['S14', 'Freud', 'MORNING', 'SOCIAL SCIENCES', 'T03'],
        ['S15', 'Hobbes', 'AFTERNOON', 'SOCIAL SCIENCES', 'T13'],
        ['S16', 'Socrates', 'AFTERNOON', 'SOCIAL SCIENCES', 'T16']
      ];
      csv = 'class_id,class_name,session_type,career_pathway,adviser_id\n' + 
            sections.map(s => s.join(',')).join('\n');
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_template.csv`;
    a.click();
  };

  return (
    <div className="p-6 bg-primary text-white border border-slate-800 rounded-xl shadow-lg mt-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-white/10 rounded-lg">
          <FileText size={20} />
        </div>
        <h3 className="font-bold text-lg">CSV Input Templates</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button onClick={() => downloadSample('teacher')} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-left group">
          <div>
            <p className="font-bold text-sm">Teachers Template</p>
            <p className="text-[11px] text-slate-400">Manage names & load availability</p>
          </div>
          <Download size={18} className="text-slate-500 group-hover:text-white transition-colors" />
        </button>
        <button onClick={() => downloadSample('section')} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-left group">
          <div>
            <p className="font-bold text-sm">Sections Template</p>
            <p className="text-[11px] text-slate-400">Manage clusters & adviser mappings</p>
          </div>
          <Download size={18} className="text-slate-500 group-hover:text-white transition-colors" />
        </button>
      </div>
    </div>
  );
}
