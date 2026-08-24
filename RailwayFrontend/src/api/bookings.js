import api from './axios';

const bookingsApi = {
  reserve: async (data) => {
    try {
      const response = await api.post('/bookings/reserve', data);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  getByTicket: async (ticketNo) => {
    try {
      const response = await api.get(
        `/bookings/ticket/${encodeURIComponent(ticketNo)}`
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  getJourneyStatus: async (ticketNo) => {
    try {
      const response = await api.get(
        `/bookings/ticket/${encodeURIComponent(ticketNo)}/journey-status`
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  confirm: async (bookingId, paymentAmount) => {
    try {
      const response = await api.post(
        `/bookings/${bookingId}/confirm`,
        { payment_amount: paymentAmount }
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  cancel: async (bookingId, reason = null) => {
    try {
      const response = await api.post(
        `/bookings/${bookingId}/cancel`,
        { reason }
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },
};

export default bookingsApi;
