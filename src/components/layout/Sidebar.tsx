import React from 'react';
import { LayoutDashboard, Upload, Microscope, FileBarChart, Settings, LogOut, ScanEye } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'upload', label: 'Model Upload', icon: Upload },
    { id: 'test', label: 'Test Bench', icon: Microscope },
    { id: 'report', label: 'Reports', icon: FileBarChart },
  ];

  return (
    <div className="w-64 bg-gray-950 border-r border-gray-800 flex flex-col h-screen">
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <ScanEye className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">T-II Vision</span>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors text-sm font-medium",
                isActive 
                  ? "bg-blue-600/10 text-blue-400 border border-blue-600/20" 
                  : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
              )}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800 space-y-1">
        <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-900 hover:text-gray-200 text-sm font-medium transition-colors">
          <Settings className="w-5 h-5" />
          <span>Settings</span>
        </button>
        <div className="px-4 py-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">Nut Srisuchin T-II-IP2</p>
              <p className="text-xs text-gray-500 truncate">nut.sr@pttgcgroup.com</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
