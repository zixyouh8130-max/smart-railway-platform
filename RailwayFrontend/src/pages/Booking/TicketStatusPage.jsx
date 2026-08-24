import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import bookingsApi from '@/api/bookings';
import Button from '@/components/ui/button';
import {
  formatRailwayDate,
  formatRailwayTime,
} from '@/utils/railwayDateTime';

const TicketStatusPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [ticketNo, setTicketNo] = useState(searchParams.get('ticket') || '');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const search = async (value = ticketNo) => {
    const normalized = value.trim();
    if (!normalized) return;

    setLoading(true);
    setError(null);

    try {
      const data = await bookingsApi.getJourneyStatus(normalized);
      setResult(data);
      setSearchParams({ ticket: normalized });
    } catch (err) {
      setResult(null);
      setError(err.detail || err.message || 'Ticket not found.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = searchParams.get('ticket');
    if (initial) search(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen pt-24 px-4 pb-12 bg-gray-50">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h1 className="text-2xl font-bold mb-4">Ticket / Journey Status</h1>
          <div className="flex gap-2">
            <input
              value={ticketNo}
              onChange={(e) => setTicketNo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Enter ticket number"
              className="flex-1 border rounded px-3 py-2"
            />
            <Button onClick={() => search()} disabled={loading}>
              {loading ? 'Checking...' : 'Check'}
            </Button>
          </div>
          {error && <p className="text-red-600 mt-3">{error}</p>}
        </div>

        {result && (
          <div className="bg-white rounded-xl shadow p-6">
            <div className="grid sm:grid-cols-2 gap-3 mb-6">
              <p>Ticket: <strong>{result.ticket_no}</strong></p>
              <p>Booking: <strong>{result.booking_status}</strong></p>
              <p>Schedule: <strong>{result.schedule_status}</strong></p>
              <p>Travel date: <strong>{formatRailwayDate(result.travel_date, 'en-GB')}</strong></p>
              <p>From: <strong>{result.boarding_station}</strong></p>
              <p>To: <strong>{result.destination_station}</strong></p>
            </div>

            {result.last_reached && (
              <div className="mb-6 p-4 bg-green-50 rounded">
                <p className="font-semibold">Last reached: {result.last_reached.station_name}</p>
                <p className="text-sm text-gray-600">
                  {result.last_reached.status}
                  {result.last_reached.arrival_time
                    ? ` · ${formatRailwayTime(result.last_reached.arrival_time)}`
                    : ''}
                </p>
              </div>
            )}

            <div className="space-y-2">
              {(result.stops || []).map((stop) => (
                <div
                  key={stop.route_station_id}
                  className={`border rounded p-3 ${
                    stop.in_passenger_segment ? 'bg-blue-50' : 'bg-gray-50 opacity-70'
                  }`}
                >
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="font-medium">{stop.station_name}</p>
                      <p className="text-xs text-gray-500">
                        {stop.is_boarding_station
                          ? 'Boarding station'
                          : stop.is_destination_station
                            ? 'Destination'
                            : stop.status}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p>Expected: {stop.expected_arrival || stop.expected_departure || '--:--'}</p>
                      {(stop.actual_arrival || stop.actual_departure) && (
                        <p>Actual: {formatRailwayTime(stop.actual_arrival || stop.actual_departure)}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketStatusPage;