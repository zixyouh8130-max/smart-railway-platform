// pages/Inspection/InspectionDashboard.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, RefreshCw, TrendingUp, AlertTriangle, Video, Clock,
  MapPin, ChevronRight, X, Calendar, BarChart3, PieChart as PieChartIcon,
  Layers, Maximize2
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { inspectionApi } from '@/api/inspectionAPI';

// Fix Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Color palette for defect types
const DEFECT_COLORS = {
  'Faulty Fishplate': '#EF4444',
  'Missing Fastener': '#F59E0B',
  'Track Break': '#DC2626',
  'Track Crack': '#EF4444',
  'Damaged Track': '#DC2626',
  'perfect track': '#10B981',
};

const DEFECT_ICONS = {
  'Faulty Fishplate': '🔴',
  'Missing Fastener': '🔶',
  'Track Break': '💥',
  'Track Crack': '🔴',
  'Damaged Track': '⚠️',
  'perfect track': '✅',
};

// Custom marker icons for different defect types
const createDefectIcon = (defectType, isSelected = false) => {
  const colors = {
    'Faulty Fishplate': '#EF4444',
    'Missing Fastener': '#F59E0B',
    'Track Break': '#DC2626',
    'Track Crack': '#EF4444',
    'Damaged Track': '#DC2626',
  };
  
  const color = colors[defectType] || '#EF4444';
  const size = isSelected ? 36 : 28;
  
  return L.divIcon({
    className: 'custom-defect-marker',
    html: `
      <div style="
        background-color: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${size * 0.5}px;
        color: white;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s;
        transform: ${isSelected ? 'scale(1.2)' : 'scale(1)'};
      ">
        ${defectType.charAt(0)}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size/2, size],
    popupAnchor: [0, -size],
  });
};

// Component to fit map bounds
function FitBounds({ positions }) {
  const map = useMap();
  
  useEffect(() => {
    if (positions && positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, positions]);
  
  return null;
}

// Map component
function DefectMap({ events, selectedEventId, onMarkerClick }) {
  const [mapKey, setMapKey] = useState(0);
  
  // Filter events with valid GPS coordinates
  const validEvents = useMemo(() => {
    return events.filter(event => 
      event.gps && 
      event.gps.latitude !== null && 
      event.gps.longitude !== null &&
      !isNaN(event.gps.latitude) &&
      !isNaN(event.gps.longitude)
    );
  }, [events]);

  // Group events by defect type for legend
  const defectTypes = useMemo(() => {
    const types = {};
    validEvents.forEach(event => {
      if (!types[event.defect_type]) {
        types[event.defect_type] = 0;
      }
      types[event.defect_type]++;
    });
    return types;
  }, [validEvents]);

  // Calculate center based on events or use default
  const center = useMemo(() => {
    if (validEvents.length > 0) {
      const lat = validEvents.reduce((sum, e) => sum + e.gps.latitude, 0) / validEvents.length;
      const lng = validEvents.reduce((sum, e) => sum + e.gps.longitude, 0) / validEvents.length;
      return [lat, lng];
    }
    return [16.123456, 96.123456];
  }, [validEvents]);

  // Get positions for bounds
  const positions = useMemo(() => {
    return validEvents.map(e => [e.gps.latitude, e.gps.longitude]);
  }, [validEvents]);

  if (validEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50 rounded-lg">
        <MapPin className="w-12 h-12 text-gray-400 mb-2" />
        <p className="text-gray-500 text-sm">No GPS data available for this inspection</p>
        <p className="text-gray-400 text-xs">Defect locations require GPS coordinates</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full rounded-lg overflow-hidden">
      <MapContainer
        key={mapKey}
        center={center}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {validEvents.map((event) => {
          const isSelected = event.id === selectedEventId;
          const position = [event.gps.latitude, event.gps.longitude];
          
          return (
            <Marker
              key={event.id}
              position={position}
              icon={createDefectIcon(event.defect_type, isSelected)}
              eventHandlers={{
                click: () => onMarkerClick(event.id),
              }}
            >
              <Popup>
                <div className="p-2 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{DEFECT_ICONS[event.defect_type] || '🔴'}</span>
                    <span className="font-semibold">{event.defect_type}</span>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Confidence:</span>
                      <span className="font-medium">{(event.confidence * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Time:</span>
                      <span className="font-medium">{event.start_timestamp.toFixed(1)}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Detections:</span>
                      <span className="font-medium">{event.detection_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Location:</span>
                      <span className="font-medium text-xs">
                        {event.gps.latitude.toFixed(6)}, {event.gps.longitude.toFixed(6)}
                      </span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
        
        <FitBounds positions={positions} />
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg p-3 z-[1000]">
        <div className="text-xs font-medium text-gray-700 mb-2">Defect Types</div>
        {Object.entries(defectTypes).map(([type, count]) => (
          <div key={type} className="flex items-center gap-2 text-xs py-0.5">
            <div 
              className="w-3 h-3 rounded-full border border-white shadow-sm"
              style={{ backgroundColor: DEFECT_COLORS[type] || '#EF4444' }}
            />
            <span className="text-gray-600">{type}</span>
            <span className="text-gray-400 ml-1">({count})</span>
          </div>
        ))}
      </div>

      {/* Stats overlay */}
      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg px-3 py-2 z-[1000]">
        <div className="text-xs text-gray-600">
          <span className="font-medium">{validEvents.length}</span> defects shown
        </div>
      </div>
    </div>
  );
}

const InspectionDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inspections, setInspections] = useState([]);
  const [overviewStats, setOverviewStats] = useState(null);
  const [defectStats, setDefectStats] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [mapView, setMapView] = useState('all'); // 'all' or 'defect'

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [stats, defectStatsData, inspectionsData] = await Promise.all([
        inspectionApi.getOverviewStatistics(),
        inspectionApi.getDefectStatistics(),
        inspectionApi.getInspections(20, 0),
      ]);
      setOverviewStats(stats);
      setDefectStats(defectStatsData);
      setInspections(inspectionsData);
    } catch (err) {
      setError('Failed to load inspection data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      fetchDashboardData();
      return;
    }
    setLoading(true);
    try {
      const results = await inspectionApi.searchInspections(searchQuery);
      setInspections(results);
    } catch (err) {
      setError('Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = async (inspectionId) => {
    setDetailLoading(true);
    setDetailDialogOpen(true);
    setSelectedEventId(null);
    try {
      const data = await inspectionApi.getInspectionDetail(inspectionId);
      setDetailData(data);
    } catch (err) {
      setError('Failed to load inspection details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleMarkerClick = (eventId) => {
    setSelectedEventId(eventId);
    // Scroll to the event in the table
    const element = document.getElementById(`event-${eventId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.style.backgroundColor = '#FEF3C7';
      setTimeout(() => {
        element.style.backgroundColor = '';
      }, 2000);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  // Prepare chart data
  const defectChartData = defectStats.map(d => ({
    name: d.defect_type,
    value: d.count,
    confidence: d.avg_confidence,
  }));

  const timelineData = inspections.map(insp => ({
    date: new Date(insp.created_at).toLocaleDateString(),
    defects: insp.inspection_events,
    video: insp.video_name?.substring(0, 20) || 'Unknown',
  })).reverse();

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🚆 Track Inspection Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">AI-powered railway track inspection results</p>
        </div>
        <button
          onClick={fetchDashboardData}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Inspections</p>
              <p className="text-2xl font-bold text-gray-900">{overviewStats?.total_inspections || 0}</p>
            </div>
            <Video className="w-10 h-10 text-blue-500 opacity-70" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Defects</p>
              <p className="text-2xl font-bold text-red-600">{overviewStats?.total_defects || 0}</p>
            </div>
            <AlertTriangle className="w-10 h-10 text-red-500 opacity-70" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Latest Inspection</p>
              <p className="text-sm font-medium text-gray-900 truncate max-w-[150px]">
                {overviewStats?.latest_inspection?.video_name || 'N/A'}
              </p>
              <p className="text-xs text-gray-400">
                {overviewStats?.latest_inspection?.created_at 
                  ? formatDate(overviewStats.latest_inspection.created_at)
                  : 'No data'}
              </p>
            </div>
            <Clock className="w-10 h-10 text-gray-400 opacity-70" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Avg Confidence</p>
              <p className="text-2xl font-bold text-green-600">
                {defectStats.length > 0
                  ? `${(defectStats.reduce((acc, d) => acc + d.avg_confidence, 0) / defectStats.length * 100).toFixed(1)}%`
                  : 'N/A'}
              </p>
            </div>
            <TrendingUp className="w-10 h-10 text-green-500 opacity-70" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: 'overview', label: '📊 Overview' },
            { id: 'list', label: '📋 Inspections' },
            { id: 'analytics', label: '📈 Analytics' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {/* Overview Tab - Same as before */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Defect Distribution */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Defect Distribution</h3>
              {defectChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={defectChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={80}
                      dataKey="value"
                    >
                      {defectChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={DEFECT_COLORS[entry.name] || '#8884d8'} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-gray-500">No defect data available</div>
              )}
            </div>

            {/* Confidence by Defect */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Average Confidence by Defect</h3>
              {defectChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={defectChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                    <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
                    <Bar dataKey="confidence" fill="#3B82F6" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-gray-500">No confidence data available</div>
              )}
            </div>

            {/* Defect Statistics Table */}
            <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Defect Statistics Summary</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Defect Type</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Count</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Total Detections</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Avg Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {defectStats.map((stat) => (
                      <tr key={stat.defect_type} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm text-gray-900">
                          <span className="mr-2">{DEFECT_ICONS[stat.defect_type] || '🔴'}</span>
                          {stat.defect_type}
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-900 text-right">{stat.count}</td>
                        <td className="py-3 px-4 text-sm text-gray-900 text-right">{stat.total_detections}</td>
                        <td className="py-3 px-4 text-sm text-gray-900 text-right">
                          {(stat.avg_confidence * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* List Tab */}
        {activeTab === 'list' && (
          <div>
            {/* Search Bar */}
            <div className="flex gap-3 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by video name or defect type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleSearch}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Search
              </button>
            </div>

            {/* Inspections Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Video Name</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Duration</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">FPS</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Frames</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Defects</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Created</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspections.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="text-center py-8 text-gray-500">
                          No inspections found
                        </td>
                      </tr>
                    ) : (
                      inspections.map((inspection) => (
                        <tr key={inspection.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4 text-sm text-gray-900">{inspection.video_name}</td>
                          <td className="py-3 px-4 text-sm text-gray-900 text-center">
                            {formatDuration(inspection.duration_seconds)}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-900 text-center">
                            {inspection.processed_fps} / {inspection.original_fps}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-900 text-center">
                            {inspection.processed_frames} / {inspection.total_frames}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              inspection.inspection_events > 0
                                ? 'bg-red-100 text-red-800'
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {inspection.inspection_events}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-500 text-center">
                            {formatDate(inspection.created_at)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleViewDetail(inspection.id)}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Inspection Timeline</h3>
            {timelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="defects"
                    stroke="#EF4444"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-gray-500">No timeline data available</div>
            )}
          </div>
        )}
      </div>

      {/* Detail Modal with Map */}
      {detailDialogOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 py-4">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setDetailDialogOpen(false)}></div>
            <div className="relative bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center z-10">
                <h3 className="text-lg font-semibold text-gray-900">Inspection Details</h3>
                <button
                  onClick={() => setDetailDialogOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6">
                {detailLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  </div>
                ) : detailData ? (
                  <div className="space-y-6">
                    {/* Summary */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Video</p>
                        <p className="font-medium text-sm truncate">{detailData.inspection.video_name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Duration</p>
                        <p className="font-medium">{formatDuration(detailData.inspection.duration_seconds)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Total Defects</p>
                        <p className="font-medium text-red-600">{detailData.inspection.inspection_events}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Defects with GPS</p>
                        <p className="font-medium">
                          {detailData.events.filter(e => e.gps?.latitude && e.gps?.longitude).length}
                        </p>
                      </div>
                    </div>

                    {/* Map and Events Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Map */}
                      <div className="lg:col-span-2 bg-gray-50 rounded-lg overflow-hidden" style={{ height: '450px' }}>
                        <DefectMap
                          events={detailData.events}
                          selectedEventId={selectedEventId}
                          onMarkerClick={handleMarkerClick}
                        />
                      </div>

                      {/* Event List */}
                      <div className="bg-gray-50 rounded-lg p-4 overflow-y-auto" style={{ maxHeight: '450px' }}>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-gray-900">Detected Events</h4>
                          <span className="text-xs text-gray-500">{detailData.events.length} total</span>
                        </div>
                        <div className="space-y-2">
                          {detailData.events.length === 0 ? (
                            <div className="text-center py-4 text-gray-500 text-sm">
                              No events detected
                            </div>
                          ) : (
                            detailData.events.map((event) => {
                              const hasGps = event.gps?.latitude && event.gps?.longitude;
                              return (
                                <div
                                  key={event.id}
                                  id={`event-${event.id}`}
                                  className={`bg-white rounded-lg p-3 shadow-sm border-l-4 transition-all cursor-pointer hover:shadow-md ${
                                    selectedEventId === event.id ? 'border-l-4 border-blue-500 bg-blue-50' : 'border-l-4 border-transparent'
                                  } ${hasGps ? 'hover:bg-blue-50' : 'opacity-70'}`}
                                  onClick={() => {
                                    if (hasGps) {
                                      handleMarkerClick(event.id);
                                    }
                                  }}
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-lg">{DEFECT_ICONS[event.defect_type] || '🔴'}</span>
                                        <span className="font-medium text-sm truncate">{event.defect_type}</span>
                                        {!hasGps && (
                                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                                            No GPS
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                        <span>Conf: {(event.confidence * 100).toFixed(1)}%</span>
                                        <span>•</span>
                                        <span>{event.start_timestamp.toFixed(1)}s</span>
                                        <span>•</span>
                                        <span>{event.detection_count} detections</span>
                                      </div>
                                      {hasGps && (
                                        <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                                          <MapPin className="w-3 h-3" />
                                          <span>{event.gps.latitude.toFixed(6)}, {event.gps.longitude.toFixed(6)}</span>
                                        </div>
                                      )}
                                    </div>
                                    {hasGps && (
                                      <div className="flex-shrink-0 ml-2">
                                        <div 
                                          className="w-3 h-3 rounded-full"
                                          style={{ backgroundColor: DEFECT_COLORS[event.defect_type] || '#EF4444' }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-red-600">Failed to load inspection details</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InspectionDashboard;