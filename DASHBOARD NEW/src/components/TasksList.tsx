import { Task } from '../types';
import { Clock, AlertCircle, Circle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

interface TasksListProps {
  tasks: Task[];
}

export default function TasksList({ tasks }: TasksListProps) {
  const [taskStates, setTaskStates] = useState(
    tasks.reduce((acc, task) => ({ ...acc, [task.id]: task.completed }), {} as Record<string, boolean>)
  );

  const toggleTask = (taskId: string) => {
    setTaskStates(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const getPriorityConfig = (priority: string) => {
    const configs: Record<string, { bg: string; border: string; text: string; icon: string }> = {
      high: {
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-700',
        icon: 'text-red-500',
      },
      medium: {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        text: 'text-orange-700',
        icon: 'text-orange-500',
      },
      low: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-700',
        icon: 'text-blue-500',
      },
    };
    return configs[priority];
  };

  const pendingTasks = tasks.filter(t => !taskStates[t.id]);
  const completedTasks = tasks.filter(t => taskStates[t.id]);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Upcoming Tasks</h3>
          <p className="text-sm text-gray-500">
            {pendingTasks.length} pending · {completedTasks.length} completed
          </p>
        </div>
        <div className="bg-red-100 p-2 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600" />
        </div>
      </div>

      <div className="space-y-3">
        {tasks.map((task) => {
          const config = getPriorityConfig(task.priority);
          const isCompleted = taskStates[task.id];

          return (
            <div
              key={task.id}
              className={`${config.bg} border ${config.border} rounded-lg p-4 transition-all ${
                isCompleted ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start space-x-3">
                <button
                  onClick={() => toggleTask(task.id)}
                  className="flex-shrink-0 mt-0.5 focus:outline-none group"
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 group-hover:text-green-700" />
                  ) : (
                    <Circle className={`w-5 h-5 ${config.icon} group-hover:scale-110 transition-transform`} />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isCompleted ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center mt-2 space-x-3">
                    <div className="flex items-center text-xs text-gray-600">
                      <Clock className="w-3.5 h-3.5 mr-1" />
                      {task.dueDate}
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        task.priority === 'high'
                          ? 'bg-red-100 text-red-700'
                          : task.priority === 'medium'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {task.priority}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button className="mt-4 w-full py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors">
        View All Tasks
      </button>
    </div>
  );
}
