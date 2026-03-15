import { faCreditCard } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect} from 'react'

import { loadStripe } from '@stripe/stripe-js';
import API from '../../api';
import useAuth from '../../hooks/useAuth';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

const pricingTiers = [
  {
    name: 'Base Outreach',
    price: '$25/month',
    features: [
      '10 Threads simultaneously',
      '50 messages /thread',
      '3 Discovery requests /day'
    ],
    cta: 'Get Started now',
    disabled: false
  },
  {
    name: "Test for UI",
    price: '$0/month',
    features: [
      '10 Threads simultaneously',
      '50 messages /thread',
      '3 Discovery requests /day'
    ],
    cta: 'Get Started now',
    disabled: true
  }
];

function PricingPage() {
  const { authenticated, user, loading } = useAuth();
  const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
  const navigate = useNavigate();
  const location = useLocation();
  const { locationMessage } = location.state.message || {};

  console.log(location)

  //redirect block
  useEffect(() => {
    // fetch subscription?? maybe should be inside of user
    if ( !loading && authenticated && user) {
      if (user.subscriptions && user.subscriptions.length > 0) {
        navigate('/billing');
      }
    } 
  }, [loading, authenticated, user]);

  const handleCheckout = async () => {
    try {
      const stripe = await stripePromise;

      const { data } = await API.post(`/billing/create-checkout-session`, {
        userId: user.id,
        priceId: import.meta.env.VITE_BASE_OUTREACH_PRICE_ID
      });
      console.log('Checkout session created:', data);

      window.location.href = data.url;
    } catch (error) {
      console.log('Error during checkout:', error);
    }
  }

  return (<div className='container mt-4'>
    {locationMessage && <div className='text-info'>{locationMessage}</div>}
    <h1>Get started now</h1>
    <div className='row mt-5'>
      {pricingTiers.map((tier, index) => (
        <div key={index} className='col-md-4 mb-4'>
          <div className='card'>
            <div className='card-body'>
              <h5 className='card-title'>{tier.name}</h5>
              <p className='card-text'>{tier.price}</p>
              <ul className='list-group list-group-flush'>
                {tier.features.map((feature, idx) => (
                  <li key={idx} className='list-group-item'>{feature}</li>
                ))}
              </ul>
            </div>

            <div className='card-footer d-flex justify-content-start'>
              <button className='btn btn-primary w-100' type='button' onClick={() => handleCheckout()} disabled={tier.disabled}>
                {tier.cta}
                <FontAwesomeIcon icon={faCreditCard} className='ms-2' />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>)
}

export default PricingPage