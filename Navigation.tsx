import React from 'react';

const Navigation: React.FC = () => {
  return (
    <nav className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
      <a href="/" className="px-3 py-2 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-100">
        단비배치현황
      </a>
      <a href="/gangform-ptw" className="px-3 py-2 rounded-lg text-sm font-bold text-white bg-brand-primary hover:bg-blue-700">
        갱폼 작업허가 (PTW)
      </a>
    </nav>
  );
};

export default Navigation;
