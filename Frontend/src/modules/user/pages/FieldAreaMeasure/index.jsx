import React, { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import FieldAreaMeasurementModal from '../../components/FieldAreaMeasurementModal';

/**
 * Full-screen field measurement (a route, not a popup), opened from the machinery search.
 * Expects location.state = { returnState, initialAcres, initialCenter, initialPoints }.
 * Applying the area goes back to the machinery search with the farmer's earlier choices and the measured field.
 */
const FieldAreaMeasure = () => {
  const navigate = useNavigate();
  const { state } = useLocation();
  const applied = useRef(false);

  const handleApplyArea = (field) => {
    applied.current = true;
    navigate('/user/machinery-explorer', {
      replace: true,
      state: { ...(state?.returnState || {}), measuredField: field, quantity: field?.acres }
    });
  };

  // Cancel / the X button; ignored right after Apply (the area modal closes itself once it has applied)
  const handleClose = () => {
    if (applied.current) return;
    navigate(-1);
  };

  return (
    <>
      <Helmet>
        <title>Measure Field | Agroyilt</title>
      </Helmet>
      <FieldAreaMeasurementModal
        asPage
        isOpen
        onClose={handleClose}
        onApplyArea={handleApplyArea}
        initialAcres={state?.initialAcres ?? 1}
        initialCenter={state?.initialCenter ?? null}
        initialPoints={state?.initialPoints ?? []}
      />
    </>
  );
};

export default FieldAreaMeasure;
