// Provisions a synthetic rate plan for the seeded room type when the local database has none,
// so the booking flow can request a signed quote. Runs inside Maestro's JS sandbox.
var api = typeof API_URL !== 'undefined' ? API_URL : 'http://10.0.2.2:4100';
var propertyId = '10000000-0000-4000-8000-000000000002';
var roomTypeId = '10000000-0000-4000-8000-000000000004';
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, function () { return Math.floor(Math.random() * 16).toString(16); });
}
var login = http.post(api + '/v1/auth/login', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'owner@demo.keyora.test', password: MAESTRO_PASSWORD, propertyId: propertyId, clientType: 'native', deviceName: 'Maestro fixture' }),
});
if (login.status !== 200) throw new Error('Owner login failed: ' + login.status);
var auth = { Authorization: 'Bearer ' + json(login.body).accessToken };
var plans = json(http.get(api + '/v1/properties/' + propertyId + '/rate-plans', { headers: auth }).body);
var list = Array.isArray(plans) ? plans : (plans.data || []);
var exists = list.some(function (plan) { return plan.roomTypeId === roomTypeId && plan.active !== false; });
if (!exists) {
  var created = http.post(api + '/v1/properties/' + propertyId + '/rate-plans', {
    headers: { Authorization: auth.Authorization, 'Content-Type': 'application/json', 'Idempotency-Key': uuid() },
    body: JSON.stringify({ roomTypeId: roomTypeId, name: 'Maestro Synthetic Rate', amountMinor: 95000, currency: 'MAD', minStay: 1 }),
  });
  if (created.status !== 201) throw new Error('Rate plan creation failed: ' + created.status);
}
output.ratePlanReady = true;
