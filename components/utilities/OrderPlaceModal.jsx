/**
 * @name Hotel Room Booking System
 * @author Md. Samiur Rahman (Mukul)
 * @description Hotel Room Booking and Management System Software ~ Developed By Md. Samiur Rahman (Mukul)
 * @copyright ©2023 ― Md. Samiur Rahman (Mukul). All rights reserved.
 * @version v0.0.1
 *
 */

import { ExclamationCircleOutlined } from '@ant-design/icons';
import { Button, Modal, message } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/router';
import PropTypes from 'prop-types';
import React, { useEffect, useMemo, useState } from 'react';
import { Calendar } from 'react-multi-date-picker';
import DatePickerHeader from 'react-multi-date-picker/plugins/date_picker_header';
import Toolbar from 'react-multi-date-picker/plugins/toolbar';
import ApiService from '../../utils/apiService';
import notificationWithIcon from '../../utils/notification';

const { confirm } = Modal;

function OrderPlaceModal({ bookingModal, setBookingModal, roomId }) {
  const [selectedDates, setSelectedDates] = useState([]);
  const [occupiedDates, setOccupiedDates] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const router = useRouter();

  const today = useMemo(() => dayjs().startOf('day'), []);
  const latestCheckIn = useMemo(() => today.add(30, 'day'), [today]);
  const calendarEnd = useMemo(() => today.add(60, 'day'), [today]);
  const occupiedDateSet = useMemo(() => new Set(occupiedDates), [occupiedDates]);

  useEffect(() => {
    if (!bookingModal?.open || !roomId) return undefined;

    let active = true;
    const from = today.add(1, 'day').format('YYYY-MM-DD');
    const to = calendarEnd.format('YYYY-MM-DD');
    setAvailabilityLoading(true);
    setAvailabilityError('');
    setOccupiedDates([]);
    setSelectedDates([]);
    setSelectionError('');

    ApiService.get(`/api/v1/room-availability/${roomId}`, { params: { from, to } })
      .then((response) => {
        if (!active) return;
        const data = response?.result?.data;
        const dates = Array.isArray(data?.dates) ? data.dates : [];
        setOccupiedDates([...new Set(dates.filter((date) => typeof date === 'string'))]);
      })
      .catch((error) => {
        if (!active) return;
        const apiError = error?.response?.data?.result?.error;
        setAvailabilityError((typeof apiError === 'string' ? apiError : apiError?.message)
          || error?.message
          || 'Could not load room availability. Please try again.');
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });

    return () => { active = false; };
  }, [bookingModal?.open, roomId, today, calendarEnd]);

  const handleDateChange = (dates) => {
    const range = Array.isArray(dates) ? dates : dates ? [dates] : [];
    setSelectionError('');
    if (range.length === 0) {
      setSelectedDates([]);
      return;
    }

    const checkIn = dayjs(range[0]?.toDate ? range[0].toDate() : range[0]).startOf('day');
    if (!checkIn.isValid() || !checkIn.isAfter(today) || checkIn.isAfter(latestCheckIn)) {
      setSelectedDates([]);
      setSelectionError('Choose a check-in date within the next 30 days.');
      return;
    }
    if (range.length === 1) {
      const firstDate = checkIn.format('YYYY-MM-DD');
      if (occupiedDateSet.has(firstDate)) {
        setSelectedDates([]);
        setSelectionError('That check-in night is occupied. Choose another date.');
        return;
      }
      setSelectedDates(range);
      return;
    }

    const checkOut = dayjs(range[1]?.toDate ? range[1].toDate() : range[1]).startOf('day');
    const nights = checkOut.diff(checkIn, 'day');
    if (!checkOut.isValid() || nights < 1 || nights > 30 || checkOut.isAfter(calendarEnd)) {
      setSelectedDates([range[0]]);
      setSelectionError('Check-out must be after check-in and no more than 30 nights later.');
      return;
    }

    const overlaps = occupiedDates.some((date) => {
      const occupied = dayjs(date);
      return (occupied.isSame(checkIn) || occupied.isAfter(checkIn)) && occupied.isBefore(checkOut);
    });
    if (overlaps) {
      setSelectedDates([range[0]]);
      setSelectionError('Those dates include an occupied night. Choose another check-out date.');
      return;
    }

    setSelectedDates(range.slice(0, 2));
  };

  // function to handle placed room booking order
  const handlePlacedOrder = () => {
    if (availabilityLoading || availabilityError) {
      notificationWithIcon('error', 'ERROR', availabilityError || 'Please wait while room availability loads.');
      return;
    }
    if (selectedDates.length !== 2) {
      setSelectionError('Select both a check-in and check-out date to continue.');
      return;
    }
    const checkIn = dayjs(selectedDates[0]?.toDate ? selectedDates[0].toDate() : selectedDates[0]);
    const checkOut = dayjs(selectedDates[1]?.toDate ? selectedDates[1].toDate() : selectedDates[1]);
    const nights = checkOut.diff(checkIn, 'day');
    const overlaps = occupiedDates.some((date) => {
      const occupied = dayjs(date);
      return (occupied.isSame(checkIn, 'day') || occupied.isAfter(checkIn, 'day'))
        && occupied.isBefore(checkOut, 'day');
    });
    if (nights < 1 || nights > 30 || !checkIn.isAfter(today)
      || checkIn.isAfter(latestCheckIn) || checkOut.isAfter(calendarEnd) || overlaps) {
      setSelectionError('Please choose a valid, available stay of 1–30 nights.');
      return;
    }

    confirm({
      title: 'Confirm your room reservation dates?',
      icon: <ExclamationCircleOutlined />,
      okText: 'Ok',
      cancelText: 'Cancel',
      onOk() {
        return new Promise((resolve, reject) => {
          ApiService.post(`/api/v1/placed-booking-order/${roomId}`, {
            check_in: checkIn.format('YYYY-MM-DD'),
            check_out: checkOut.format('YYYY-MM-DD')
          })
            .then((res) => {
              resolve();
              if (res?.result_code === 0) {
                notificationWithIcon('success', 'SUCCESS', (res?.result?.message || 'Your room booking order placed successful'));
                setBookingModal((prevState) => ({ ...prevState, open: false, roomId: null }));
                router.push('/profile?tab=booking-history');
                setSelectedDates([]);
              } else {
                notificationWithIcon('error', 'ERROR', 'Sorry! Something went wrong. App server error');
              }
            })
            .catch((err) => {
              notificationWithIcon('error', 'ERROR', (err?.response?.data?.result?.error?.message || err?.message || 'Sorry! Something went wrong. App server error'));
              reject(err);
            });
        }).catch((err) => message.error(err?.message || 'Oops errors!'));
      }
    });
  };

  return (
    <Modal
      title='Select your check-in and check-out dates'
      open={bookingModal.open}
      onOk={() => setBookingModal((prevState) => (
        { ...prevState, open: false, roomId: null }
      ))}
      onCancel={() => setBookingModal((prevState) => (
        { ...prevState, open: false, roomId: null }
      ))}
      closable={false}
      centered
      footer={[
        <div key='custom-footer'>
          {/* button closed/hide modal */}
          <Button
            onClick={() => setBookingModal((prevState) => (
              { ...prevState, open: false, roomId: null }
            ))}
            type='default'
            size='middle'
          >
            Cancel
          </Button>

          {/* button to handle placed order */}
          <Button
            disabled={availabilityLoading || Boolean(availabilityError) || selectedDates.length !== 2}
            onClick={handlePlacedOrder}
            type='primary'
            size='middle'
          >
            Placed Order
          </Button>
        </div>
      ]}
    >
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Calendar
          style={{ width: '100%' }}
          plugins={[
            <DatePickerHeader
              key='date-picker-header'
              position='top'
              size='medium'
            />,
            <Toolbar
              key='toolbar'
              position='bottom'
            />
          ]}
          minDate={today.add(1, 'day').toDate()}
          maxDate={calendarEnd.toDate()}
          onChange={handleDateChange}
          value={selectedDates}
          format='YYYY/MM/DD'
          highlightToday
          range
          mapDays={({ date }) => {
            const dateText = dayjs(date.toDate()).format('YYYY-MM-DD');
            const isOccupied = occupiedDateSet.has(dateText);
            const checkInSelected = selectedDates.length === 1;
            const selectedCheckIn = checkInSelected
              ? dayjs(selectedDates[0]?.toDate ? selectedDates[0].toDate() : selectedDates[0]).startOf('day')
              : null;
            const isAllowedCheckout = checkInSelected
              && dayjs(date.toDate()).startOf('day').isAfter(selectedCheckIn);
            return {
              disabled: isOccupied && !isAllowedCheckout,
              style: isOccupied ? { color: '#999', backgroundColor: '#f0f0f0', textDecoration: 'line-through' } : {}
            };
          }}
        />
      </div>
      <p style={{ marginTop: 12 }}>
        {availabilityLoading ? 'Checking room availability…' : 'Choose check-in first, then check-out. Stays are 1–30 nights; check-in must be within the next 30 days.'}
      </p>
      {selectedDates.length > 0 && (
        <p>
          Check-in:
          {' '}
          <strong>
            {dayjs(selectedDates[0]?.toDate ? selectedDates[0].toDate() : selectedDates[0]).format('MMM D, YYYY')}
          </strong>
          {selectedDates.length > 1 && (
            <>
              {' · '}
              Check-out:
              {' '}
              <strong>
                {dayjs(selectedDates[1]?.toDate ? selectedDates[1].toDate() : selectedDates[1]).format('MMM D, YYYY')}
              </strong>
            </>
          )}
        </p>
      )}
      {(selectionError || availabilityError) && (
        <p role='alert' style={{ color: '#cf1322' }}>
          {selectionError || availabilityError}
        </p>
      )}
    </Modal>
  );
}

OrderPlaceModal.defaultProps = {
  bookingModal: { open: false, roomId: null },
  roomId: null
};

OrderPlaceModal.propTypes = {
  bookingModal: PropTypes.object,
  roomId: PropTypes.string
};

export default OrderPlaceModal;
