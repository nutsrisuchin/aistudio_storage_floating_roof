import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { TestResult, ModelMetadata } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Download, Share2, Filter } from 'lucide-react';
import { Button } from '../components/ui/Button';

interface ReportProps {
  results: TestResult[];
  models: ModelMetadata[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export function Report({ results, models }: ReportProps) {
  // Aggregate detections by label
  const labelCounts: Record<string, number> = {};
  results.forEach(r => {
    r.detections.forEach(d => {
      labelCounts[d.label] = (labelCounts[d.label] || 0) + 1;
    });
  });

  const pieData = Object.entries(labelCounts).map(([name, value]) => ({ name, value }));

  // Aggregate inference time by model
  const modelPerformance = models.map(m => {
    const modelResults = results.filter(r => r.modelId === m.id);
    const avgTime = modelResults.length > 0 
      ? modelResults.reduce((acc, r) => acc + r.inferenceTime, 0) / modelResults.length 
      : 0;
    return {
      name: m.name,
      avgTime: avgTime || m.inferenceTime || 0, // Fallback to metadata if no tests run
    };
  });

  return (
    <div className="p-8 space-y-8 bg-gray-950 min-h-screen text-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Performance Reports</h1>
          <p className="text-gray-400">Detailed analysis of model performance and detection statistics.</p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" />
            Filter
          </Button>
          <Button variant="outline" size="sm">
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => window.print()}>
            <Download className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle>Detection Distribution</CardTitle>
            <CardDescription>Breakdown of object classes detected across all tests.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  No detection data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle>Model Latency Comparison</CardTitle>
            <CardDescription>Average inference time (ms) per model.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelPerformance} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                  <XAxis type="number" stroke="#9CA3AF" unit="ms" />
                  <YAxis dataKey="name" type="category" stroke="#9CA3AF" width={100} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                    cursor={{ fill: '#374151' }}
                  />
                  <Bar dataKey="avgTime" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle>Detailed Test Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-400">
              <thead className="text-xs text-gray-500 uppercase bg-gray-800/50">
                <tr>
                  <th scope="col" className="px-6 py-3">Timestamp</th>
                  <th scope="col" className="px-6 py-3">Model ID</th>
                  <th scope="col" className="px-6 py-3">Detections</th>
                  <th scope="col" className="px-6 py-3">Inference Time</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.id} className="bg-gray-900 border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-6 py-4 font-mono">
                      {new Date(result.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">
                      {result.modelId.substring(0, 8)}...
                    </td>
                    <td className="px-6 py-4">
                      {result.detections.length} objects
                    </td>
                    <td className="px-6 py-4 font-mono text-blue-400">
                      {result.inferenceTime.toFixed(2)}ms
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-green-500/10 text-green-500 px-2 py-1 rounded-full text-xs">
                        Success
                      </span>
                    </td>
                  </tr>
                ))}
                {results.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      No test results found. Run a test in the Test Bench.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
