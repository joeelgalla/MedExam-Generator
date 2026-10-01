
import React, { useState, useRef } from 'react';
import { Project, BlueprintSection } from '../types';
import { Plus, FolderOpen, Calendar, Trash2, FileText, ArrowRight, Share2, Upload, DownloadCloud } from 'lucide-react';
import ProjectForm from './ProjectForm';
import {projectShare,downloadText} from '../services/projectWorkflow';

interface ProjectListProps {
  projects: Project[];
  onSelectProject: (project: Project, action?:'share') => void;
  onCreateProject: (name: string, description: string, blueprint: BlueprintSection[], referenceTotal: number, instructions?: string) => void;
  onDeleteProject: (id: string) => void;
  onImportProject: (data: any) => void;
}

const ProjectList: React.FC<ProjectListProps> = ({ projects, onSelectProject, onCreateProject, onDeleteProject, onImportProject }) => {
  const [isCreating, setIsCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleCreate = (name: string, description: string, blueprint: BlueprintSection[], referenceTotal: number, instructions?: string) => {
    onCreateProject(name, description, blueprint, referenceTotal, instructions);
    setIsCreating(false);
  };

  const handleExport = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    onSelectProject(project,'share');
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if(file.size>20*1024*1024){alert('Choose a project under 20 MB.');return;}
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        onImportProject(json);
      } catch (err) {
        alert("Failed to parse project file.");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 animate-fadeIn">
      <div className="mb-8 rounded-2xl border border-blue-100 bg-white p-5 sm:p-7"><h2 className="text-xl font-semibold tracking-tight">Study materials in. Practice exams out.</h2><div className="grid sm:grid-cols-3 gap-5 mt-5 text-sm"><p><strong className="block text-slate-900 mb-1">1. Set up a project</strong><span className="text-slate-600">Add your objectives and notes, or import a project from a friend.</span></p><p><strong className="block text-slate-900 mb-1">2. Create your exam</strong><span className="text-slate-600">Generate questions here, or import an exam made elsewhere.</span></p><p><strong className="block text-slate-900 mb-1">3. Practise and improve</strong><span className="text-slate-600">Take a timed exam, review explanations and track your progress.</span></p></div></div>
      {new URLSearchParams(window.location.search).get('import')==='project'&&<div role="status" className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6"><h3 className="font-semibold">Received a project from a friend?</h3><p className="text-slate-600 text-sm my-2">Choose Import project below and select their .medexam file. It becomes your own copy with fresh progress.</p><button className="action-primary" onClick={handleImportClick}>Choose shared project file</button></div>}
      <div className="flex flex-wrap gap-4 justify-between items-end mb-8">
        <div>
          <h2 className="text-3xl font-semibold text-slate-900">My projects</h2>
          <p className="text-slate-500 mt-1">Each project keeps its study materials, exams and progress together.</p>
        </div>
        <div className="flex gap-2">
            <button
                onClick={handleImportClick}
                className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium"
            >
                <Upload className="w-5 h-5" /> Import project
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".medexam,.json" 
                onChange={handleFileChange}
            />
            
            <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
            >
            <Plus className="w-5 h-5" /> New Project
            </button>
        </div>
      </div>

      {isCreating && (
        <div className="mb-8">
            <ProjectForm 
                onSubmit={handleCreate}
                onCancel={() => setIsCreating(false)}
            />
        </div>
      )}

      {projects.length === 0 && !isCreating ? (
        <div className="text-center py-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
          <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900">No projects yet</h3>
          <p className="text-slate-500 mt-1 mb-6">Create a project or Import one to start generating exams.</p>
          <div className="flex justify-center gap-4">
              <button
                onClick={() => setIsCreating(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
              >
                <Plus className="w-5 h-5" /> Create First Project
              </button>
              <button
                onClick={handleImportClick}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm font-medium"
              >
                <DownloadCloud className="w-5 h-5" /> Import project
              </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-200 flex flex-col"
            >
              <div 
                className="p-6 cursor-pointer flex-grow"
                onClick={() => onSelectProject(project)}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                    <FolderOpen className="w-6 h-6 text-blue-600" />
                  </div>
                  <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded-md border border-slate-200">
                      {(project.savedExams||[]).filter(e=>!e.retired).length} exams
                  </span>
                </div>
                
                <h3 className="text-xl font-semibold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">
                  {project.name}
                </h3>
                <p className="text-sm text-slate-500 mb-4 line-clamp-2 min-h-[1.5rem]">
                  {project.description || "Open to generate, import or take an exam."}
                </p>

                {/* Blueprint Badges */}
                <div className="flex flex-wrap gap-2 mb-6">
                    {project.blueprint.slice(0, 3).map(section => (
                        <span key={section.id} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                            {section.title}{section.questionCount?` (${section.questionCount})`:''}
                        </span>
                    ))}
                    {project.blueprint.length > 3 && <span className="text-xs text-slate-400">+{project.blueprint.length - 3} more</span>}
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-400 mb-4">
                  <div className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    <span>
                        {project.learningObjectivesFiles.length + project.blueprint.reduce((acc, s) => acc + s.files.length, 0)} Files
                    </span>
                  </div>
                   <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{Number.isFinite(Date.parse(project.lastModified))?new Date(project.lastModified).toLocaleDateString():'Saved project'}</span>
                  </div>
                </div>

                 {/* Mini Progress Bar */}
                 {project.examHistory.some(a=>a.totalQuestions>0) && (
                    <div className="mb-2">
                        <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-slate-600">Avg Score</span>
                            <span className="text-slate-500">
                                {Math.round(project.examHistory.filter(a=>a.totalQuestions>0).reduce((acc, curr) => acc + (curr.score/curr.totalQuestions), 0) / project.examHistory.filter(a=>a.totalQuestions>0).length * 100)}%
                            </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                            <div 
                                className="bg-green-500 h-1.5 rounded-full" 
                                style={{ width: `${Math.round(project.examHistory.filter(a=>a.totalQuestions>0).reduce((acc, curr) => acc + (curr.score/curr.totalQuestions), 0) / project.examHistory.filter(a=>a.totalQuestions>0).length * 100)}%`}}
                            ></div>
                        </div>
                    </div>
                 )}
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-xl flex items-center justify-between">
                <button
                    onClick={() => onSelectProject(project)}
                    className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                    Open <ArrowRight className="w-4 h-4" />
                </button>
                
                <div className="flex gap-2">
                    <button
                        onClick={(e) => handleExport(e, project)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                        title="Share project"
                    >
                        <Share2 className="w-4 h-4" />
                    </button>
                    <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if(window.confirm(`Delete "${project.name}"? This cannot be undone.`)) {
                            onDeleteProject(project.id);
                        }
                    }}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                    title="Delete Project"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-sm text-slate-500 mt-8">Only have a standalone question file? <a className="text-blue-700 underline" href="/practice.html">Open the quick exam player</a>.</p>
    </div>
  );
};

export default ProjectList;
