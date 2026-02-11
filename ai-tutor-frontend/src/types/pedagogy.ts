/**
 * Type definitions for pedagogy modes
 */

export type PedagogyMode = 'explanatory' | 'debugging' | 'practice' | 'concise'

export interface PedagogyModeInfo {
  id: PedagogyMode
  name: string
  description: string
  icon: string
  color: string
}

export const PEDAGOGY_MODES: PedagogyModeInfo[] = [
  {
    id: 'explanatory',
    name: 'Teach Me',
    description: 'Clear explanations with examples - learn new concepts',
    icon: '📖',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  {
    id: 'debugging',
    name: 'Debug Help',
    description: 'Fix my code with hints - no spoilers',
    icon: '🐛',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  {
    id: 'practice',
    name: 'Practice',
    description: 'Test my understanding with guided questions',
    icon: '🎯',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  },
  {
    id: 'concise',
    name: 'Concise',
    description: 'Short, UI-friendly answers with minimal fluff',
    icon: '🧩',
    color: 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200',
  },
]
