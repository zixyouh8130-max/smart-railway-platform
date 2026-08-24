import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import schedulesApi from '@/api/schedules';
import routesApi from '@/api/routes';
import seatsApi from '@/api/seats';
import bookingsApi from '@/api/bookings';
import feesApi from '@/api/fees';
import Button from '@/components/ui/button';
import {
  formatRailwayDate,
  formatRailwayTime,
} from '@/utils/railwayDateTime';

const feeClassForCoach = (coachType) => {
  const map = {
    UPPER_CLASS: 'UPPER_CLASS',
    ECONOMY_CLASS: 'ECONOMY_CLASS',
    SLEEPER: 'SLEEPER',
  };

  return map[
    String(coachType || '').toUpperCase()
  ] || null;
};

const resolveRouteStation = (stations, stationLike, fallbackIndex) => {
  const canonicalId = stationLike?.stationId ?? stationLike?.id ?? null;

  if (canonicalId !== null) {
    const match = stations.find(
      (item) => Number(item.station_id) === Number(canonicalId)
    );
    if (match) return match;
  }

  const name = stationLike?.name;
  if (name) {
    const normalized = String(name).trim().toLowerCase();
    const match = stations.find(
      (item) => String(item.station_name || '').trim().toLowerCase() === normalized
    );
    if (match) return match;
  }

  return stations[fallbackIndex] || null;
};

const BookingPage = () => {
  const { scheduleId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [schedule, setSchedule] = useState(location.state?.schedule || null);
  const [route, setRoute] = useState(null);
  const [seatMap, setSeatMap] = useState(null);
  const [fromRouteStation, setFromRouteStation] = useState(null);
  const [toRouteStation, setToRouteStation] = useState(null);
  const [selectedCoachId, setSelectedCoachId] = useState('');
  const [selectedSeatId, setSelectedSeatId] = useState('');
  const [fare, setFare] = useState(null);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    customer_name: '',
    nrc: '',
    phone: '',
    email: '',
    passenger_count: 1,
    passenger_names: '',
    notes: '',
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const scheduleData = schedule || await schedulesApi.getById(Number(scheduleId));
        setSchedule(scheduleData);

        if (scheduleData.status !== 'SCHEDULED') {
          throw new Error('This service is no longer available for new bookings.');
        }

        const [routeData, seatsData] = await Promise.all([
          routesApi.getById(scheduleData.route_id),
          seatsApi.getScheduleSeatMap(Number(scheduleId)),
        ]);

        setRoute(routeData);
        setSeatMap(seatsData);

        const routeStations = [...(routeData.stations || [])].sort(
          (a, b) => a.order_number - b.order_number
        );

        setFromRouteStation(
          resolveRouteStation(routeStations, location.state?.fromStation, 0)
        );
        setToRouteStation(
          resolveRouteStation(
            routeStations,
            location.state?.toStation,
            Math.max(routeStations.length - 1, 0)
          )
        );

        const firstCoach = seatsData.coaches?.find((coach) =>
          coach.seats?.some(
            (seat) => seat.available && !['DINING', 'BAGGAGE'].includes(seat.seat_type)
          )
        );

        if (firstCoach) {
          setSelectedCoachId(String(firstCoach.id));
          const firstSeat = firstCoach.seats.find(
            (seat) => seat.available && !['DINING', 'BAGGAGE'].includes(seat.seat_type)
          );
          if (firstSeat) setSelectedSeatId(String(firstSeat.id));
        }
      } catch (err) {
        setError(err.detail || err.message || 'Unable to load booking information.');
      } finally {
        setLoading(false);
      }
    };

    load();
    // Initial schedule/navigation state is intentionally consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleId]);

  const selectedCoach = useMemo(
    () => seatMap?.coaches?.find(
      (coach) => Number(coach.id) === Number(selectedCoachId)
    ) || null,
    [seatMap, selectedCoachId]
  );

  const selectedSeat = useMemo(
    () => selectedCoach?.seats?.find(
      (seat) => Number(seat.id) === Number(selectedSeatId)
    ) || null,
    [selectedCoach, selectedSeatId]
  );

  useEffect(() => {
    const loadFare = async () => {
      if (!schedule || !fromRouteStation || !toRouteStation || !selectedCoach || !selectedSeat) {
        setFare(null);
        return;
      }

      if (fromRouteStation.order_number >= toRouteStation.order_number) {
        setFare(null);
        return;
      }

      try {
        const result = await feesApi.calculateFee({
          train_id: schedule.train_id,
          from_station_id: fromRouteStation.id,
          to_station_id: toRouteStation.id,
          route_id: schedule.route_id,
          class_type: feeClassForCoach(
            selectedCoach.coach_type
          ),
          seat_type: selectedSeat.seat_type,
        });
        setFare(result);
        setError(null);
      } catch (err) {
        setFare(null);
        setError(err.detail || 'Fare is not configured for this journey/seat class yet.');
      }
    };

    loadFare();
  }, [schedule, fromRouteStation, toRouteStation, selectedCoach, selectedSeat]);

  const passengerCoachTypes = new Set([
    'UPPER_CLASS',
    'ECONOMY_CLASS',
    'SLEEPER',
  ]);

  const availableSeats =
    selectedCoach &&
    passengerCoachTypes.has(
      String(
        selectedCoach.coach_type
      ).toUpperCase()
    )
      ? selectedCoach.seats?.filter(
          (seat) => seat.available
        ) || []
      : [];

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!fromRouteStation || !toRouteStation || !selectedSeat) {
      setError('Please choose a valid journey and seat.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await bookingsApi.reserve({
        schedule_id: Number(scheduleId),
        seat_id: Number(selectedSeat.id),
        from_route_station_id: Number(fromRouteStation.id),
        to_route_station_id: Number(toRouteStation.id),
        customer_name: form.customer_name,
        nrc: form.nrc,
        phone: form.phone || null,
        email: form.email || null,
        passenger_count: Number(form.passenger_count) || 1,
        passenger_names: form.passenger_names || null,
        notes: form.notes || null,
      });
      setBooking(result);
    } catch (err) {
      setError(err.detail || err.message || 'Reservation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDemoPayment = async () => {
    if (!booking) return;
    setSubmitting(true);
    setError(null);

    try {
      setBooking(await bookingsApi.confirm(booking.id, booking.total_cost));
    } catch (err) {
      setError(err.detail || err.message || 'Confirmation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen pt-24 px-4">Loading booking information...</div>;
  }

  if (!schedule || !route) {
    return <div className="min-h-screen pt-24 px-4">{error || 'Schedule not found.'}</div>;
  }

  if (booking) {
    return (
      <div className="min-h-screen pt-24 px-4 bg-gray-50">
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow p-6">
          <h1 className="text-2xl font-bold mb-4">Reservation created</h1>
          <p>Ticket: <strong>{booking.ticket_no}</strong></p>
          <p>Status: <strong>{booking.booking_status}</strong></p>
          <p>Fare: <strong>{booking.total_cost} Ks</strong></p>
          <div className="flex flex-wrap gap-3 mt-6">
            {booking.booking_status === 'RESERVED' && (
              <Button onClick={confirmDemoPayment} disabled={submitting}>
                Confirm demo payment
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => navigate(`/pnr-status?ticket=${encodeURIComponent(booking.ticket_no)}`)}
            >
              Check journey status
            </Button>
          </div>
          {error && <p className="text-red-600 mt-4">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 px-4 pb-12 bg-gray-50">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-bold mb-2">Book train ticket</h1>
        <p className="text-gray-600 mb-6">
          {schedule.train?.train_name || `Train ${schedule.train_id}`}
          {' · '}{formatRailwayDate(schedule.departure_date, 'en-GB')}
          {' · '}{formatRailwayTime(schedule.departure_time, 'en-US')}
        </p>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <label className="text-sm font-medium">
            From
            <select
              value={fromRouteStation?.id || ''}
              onChange={(e) => setFromRouteStation(
                route.stations.find((item) => Number(item.id) === Number(e.target.value)) || null
              )}
              className="w-full border rounded px-3 py-2 mt-1"
            >
              {(route.stations || [])
                .filter((item) => !toRouteStation || item.order_number < toRouteStation.order_number)
                .map((item) => <option key={item.id} value={item.id}>{item.station_name}</option>)}
            </select>
          </label>

          <label className="text-sm font-medium">
            To
            <select
              value={toRouteStation?.id || ''}
              onChange={(e) => setToRouteStation(
                route.stations.find((item) => Number(item.id) === Number(e.target.value)) || null
              )}
              className="w-full border rounded px-3 py-2 mt-1"
            >
              {(route.stations || [])
                .filter((item) => !fromRouteStation || item.order_number > fromRouteStation.order_number)
                .map((item) => <option key={item.id} value={item.id}>{item.station_name}</option>)}
            </select>
          </label>

          <label className="text-sm font-medium">
            Coach
            <select
              value={selectedCoachId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedCoachId(id);
                const coach = seatMap?.coaches?.find((item) => Number(item.id) === Number(id));
                const seat = coach?.seats?.find(
                  (item) => item.available && !['DINING', 'BAGGAGE'].includes(item.seat_type)
                );
                setSelectedSeatId(seat ? String(seat.id) : '');
              }}
              className="w-full border rounded px-3 py-2 mt-1"
            >
              {(seatMap?.coaches || [])
                .filter((coach) => coach.seats?.some(
                  (seat) => seat.available && !['DINING', 'BAGGAGE'].includes(seat.seat_type)
                ))
                .map((coach) => (
                  <option key={coach.id} value={coach.id}>{coach.name} ({coach.coach_type})</option>
                ))}
            </select>
          </label>

          <label className="text-sm font-medium">
            Seat
            <select
              value={selectedSeatId}
              onChange={(e) => setSelectedSeatId(e.target.value)}
              className="w-full border rounded px-3 py-2 mt-1"
            >
              {availableSeats.map((seat) => (
                <option key={seat.id} value={seat.id}>{seat.seat_number} ({seat.seat_type})</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mb-6 p-4 bg-blue-50 rounded">
          {fare ? (
            <>
              <p className="font-semibold">Fare: {fare.total_fare} Ks</p>
              <p className="text-sm text-gray-600">
                {fare.calculation_method}{fare.distance !== null ? ` · ${fare.distance} mi` : ''}
              </p>
            </>
          ) : (
            <p className="text-sm text-amber-700">
              Fare must be configured by an admin before this ticket can be reserved.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
          <input required placeholder="Customer name" value={form.customer_name}
            onChange={(e) => setForm((prev) => ({ ...prev, customer_name: e.target.value }))}
            className="border rounded px-3 py-2" />
          <input required placeholder="NRC" value={form.nrc}
            onChange={(e) => setForm((prev) => ({ ...prev, nrc: e.target.value }))}
            className="border rounded px-3 py-2" />
          <input placeholder="Phone" value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            className="border rounded px-3 py-2" />
          <input type="email" placeholder="Email" value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            className="border rounded px-3 py-2" />
          <div className="md:col-span-2">
            <Button type="submit" disabled={submitting || !fare || !selectedSeat}>
              {submitting ? 'Reserving...' : 'Reserve ticket'}
            </Button>
          </div>
        </form>

        {error && <p className="text-red-600 mt-4">{error}</p>}
      </div>
    </div>
  );
};

export default BookingPage;
