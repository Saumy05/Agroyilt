import { useEffect, useState } from 'react';
import api from '../services/api';

// Which payment methods (cash / online) the admin allows where this farmer is booking.
// `type` is 'worker' (labour hiring) or 'machinery'. While loading, or if the lookup fails, everything is shown:
// the server enforces the rules on every payment, so this only decides what to display.
const ALL_ON = { cash: true, online: true };

export function usePaymentMethods(type) {
  const [state, setState] = useState({ ...ALL_ON, loaded: false });

  useEffect(() => {
    let alive = true;
    api.get('/users/payment-methods')
      .then(res => {
        const t = res.data?.[type];
        if (alive && t) setState({ cash: t.cash !== false, online: t.online !== false, loaded: true });
        else if (alive) setState({ ...ALL_ON, loaded: true });
      })
      .catch(() => { if (alive) setState({ ...ALL_ON, loaded: true }); });
    return () => { alive = false; };
  }, [type]);

  return state;
}

export default usePaymentMethods;
