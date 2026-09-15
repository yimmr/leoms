import { useState } from "react";

export function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl p-8 shadow-xl border border-slate-100 text-center space-y-6">
        <div className="inline-flex p-3 bg-indigo-50 text-indigo-600 rounded-xl">
          <span className="text-3xl">⚛️</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">__PROJECT_NAME__</h1>
        <p className="text-sm text-slate-500">
          React 19 + Vite + Tailwind CSS v4
        </p>

        <div className="flex justify-center gap-3">
          <button
            onClick={() => setCount((c) => c + 1)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition cursor-pointer"
          >
            Count is: {count}
          </button>
          <button
            onClick={() => setCount(0)}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition cursor-pointer"
          >
            Reset
          </button>
        </div>

        <p className="text-xs text-slate-400 font-mono">
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
    </div>
  );
}

export default App;
