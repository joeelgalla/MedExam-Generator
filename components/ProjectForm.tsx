
import React, { useState, useEffect } from 'react';
import { BlueprintSection, Project } from '../types';
import { Plus, X, PieChart, Hash, AlertTriangle, Save, FolderOpen } from 'lucide-react';

interface ProjectFormProps {
  initialData?: Project; // If provided, we are in "Edit Mode"
  onSubmit: (name: string, description: string, blueprint: BlueprintSection[], referenceTotal: number) => void;
  onCancel: () => void;
  isEditing?: boolean;
}

const ProjectForm: React.FC<ProjectFormProps> = ({ initialData, onSubmit, onCancel, isEditing = false }) => {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [referenceTotal, setReferenceTotal] = useState<number>(initialData?.referenceTotalQuestions || 40);
  
  // Initialize sections. If editing, use existing. If new, start with one default.
  const [sections, setSections] = useState<BlueprintSection[]>(
    initialData?.blueprint || [
      { id: '1', title: 'Week 1 Content', description: 'Core material', questionCount: '10-12', files: [] }
    ]
  );

  const addSection = () => {
    setSections([...sections, { 
      id: crypto.randomUUID(), 
      title: '', 
      description: '', 
      questionCount: '', 
      files: [] 
    }]);
  };

  const removeSection = (id: string) => {
    if (sections.length > 1) {
      // If editing, warn if removing a section with files
      const section = sections.find(s => s.id === id);
      if (isEditing && section && section.files.length > 0) {
        if(!window.confirm(`Section "${section.title}" contains ${section.files.length} files. Removing it will delete these files. Continue?`)) {
            return;
        }
      }
      setSections(sections.filter(s => s.id !== id));
    }
  };

  const updateSection = (id: string, field: keyof BlueprintSection, value: string) => {
    setSections(sections.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (referenceTotal <= 0) {
      alert("Please enter a valid reference total number of questions.");
      return;
    }
    onSubmit(name, description, sections, referenceTotal);
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-md animate-slideUp">
      <h3 className="text-lg font-bold text-slate-900 mb-4">
        {isEditing ? 'Edit Project Settings' : 'Create New Project'}
      </h3>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Neurology Block"
              className="w-full px-4 py-2 bg-white text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              autoFocus={!isEditing}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full px-4 py-2 bg-white text-slate-900 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Blueprint Editor */}
        <div className="border-t border-slate-100 pt-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
            <label className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <PieChart className="w-4 h-4" /> Exam Blueprint Structure
            </label>
            <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
              <span className="text-sm text-blue-800 font-medium">Reference Total Questions:</span>
              <input 
                type="number"
                min="1"
                value={referenceTotal}
                onChange={(e) => setReferenceTotal(parseInt(e.target.value) || 0)}
                className="w-16 px-2 py-1 bg-white text-sm font-bold text-center border border-blue-200 rounded text-blue-900 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          
          <p className="text-xs text-slate-500 mb-3">
            {isEditing 
                ? "Modify section titles or question distributions. Uploaded files are preserved unless you remove the section." 
                : "Define your exam sections. For each section, specify the number of questions (e.g. \"10\") or a range (e.g. \"10-12\")."}
          </p>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sections.map((section, idx) => (
              <div key={section.id} className="flex flex-col md:flex-row gap-3 items-start md:items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex-1 w-full">
                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1 md:hidden">Section Name</label>
                  <input
                    type="text"
                    value={section.title}
                    onChange={(e) => updateSection(section.id, 'title', e.target.value)}
                    placeholder={`Section ${idx + 1} Name`}
                    className="w-full px-3 py-1.5 bg-white text-slate-900 text-sm border border-slate-300 rounded focus:border-blue-500 outline-none"
                    required
                  />
                  {/* File Count Indicator (Edit Mode Only) */}
                  {isEditing && section.files.length > 0 && (
                      <div className="text-[10px] text-blue-600 flex items-center gap-1 mt-1 font-medium">
                          <FolderOpen className="w-3 h-3" /> {section.files.length} files attached
                      </div>
                  )}
                </div>
                <div className="flex-1 w-full">
                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1 md:hidden">Description</label>
                  <input
                    type="text"
                    value={section.description}
                    onChange={(e) => updateSection(section.id, 'description', e.target.value)}
                    placeholder="Brief content description"
                    className="w-full px-3 py-1.5 bg-white text-slate-900 text-sm border border-slate-300 rounded focus:border-blue-500 outline-none"
                  />
                </div>
                <div className="w-full md:w-32">
                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1 md:hidden">Questions</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={section.questionCount}
                      onChange={(e) => updateSection(section.id, 'questionCount', e.target.value)}
                      placeholder="e.g. 10-12"
                      className="w-full px-3 py-1.5 bg-white text-slate-900 text-sm border border-slate-300 rounded focus:border-blue-500 outline-none pl-7"
                      required
                    />
                    <Hash className="w-3 h-3 text-slate-400 absolute left-2.5 top-2" />
                  </div>
                </div>
                {sections.length > 1 && (
                  <button 
                    type="button" 
                    onClick={() => removeSection(section.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded mt-5 md:mt-0"
                    title={isEditing ? "Remove section (will delete files)" : "Remove section"}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addSection}
            className="mt-3 text-sm text-blue-600 font-medium hover:text-blue-800 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Add Section
          </button>
        </div>

        <div className="flex gap-3 pt-4 border-t border-slate-100">
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-white shadow-sm flex items-center gap-2"
          >
            {isEditing ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {isEditing ? 'Save Changes' : 'Create Project'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProjectForm;
