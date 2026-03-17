import { Officer } from '../types';
import { Mail, Phone, TrendingUp, TrendingDown } from 'lucide-react';

interface ProfileSectionProps {
  officer: Officer;
}

export default function ProfileSection({ officer }: ProfileSectionProps) {
  const xpProgress = (officer.currentXP / officer.xpToNextLevel) * 100;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-2xl font-bold">
            {officer.avatar}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{officer.name}</h1>
            <p className="text-gray-600 font-medium">{officer.designation}</p>
            <div className="mt-2 space-y-1">
              <div className="flex items-center text-sm text-gray-500">
                <Mail className="w-4 h-4 mr-2" />
                {officer.email}
              </div>
              <div className="flex items-center text-sm text-gray-500">
                <Phone className="w-4 h-4 mr-2" />
                {officer.phone}
              </div>
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="inline-flex items-center bg-gradient-to-r from-blue-50 to-cyan-50 px-4 py-2 rounded-lg border border-blue-200">
            <span className="text-sm text-gray-600 mr-2">Rank</span>
            <span className="text-2xl font-bold text-blue-600">#{officer.rank}</span>
            <span className="text-sm text-gray-500 ml-1">/ {officer.totalOfficers}</span>
            {officer.rankChange > 0 ? (
              <TrendingUp className="w-5 h-5 text-green-500 ml-2" />
            ) : officer.rankChange < 0 ? (
              <TrendingDown className="w-5 h-5 text-red-500 ml-2" />
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-sm font-semibold text-gray-700">Level {officer.currentLevel}</span>
            <span className="text-xs text-gray-500 ml-2">
              {officer.currentXP.toLocaleString()} / {officer.xpToNextLevel.toLocaleString()} XP
            </span>
          </div>
          <span className="text-sm font-medium text-blue-600">{xpProgress.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-blue-500 to-cyan-500 h-3 rounded-full transition-all duration-500 relative overflow-hidden"
            style={{ width: `${xpProgress}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-pulse"></div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {(officer.xpToNextLevel - officer.currentXP).toLocaleString()} XP to Level {officer.currentLevel + 1}
        </p>
      </div>
    </div>
  );
}
