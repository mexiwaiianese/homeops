const CARD_MARKS = ["Visa", "Mastercard", "American Express", "Discover"] as const;

export default function PaymentTrustMark() {
  return (
    <p className="payTrust">
      {CARD_MARKS.map((name) => (
        <span key={name} className="payTrustMark">{name}</span>
      ))}
      <span className="payTrustNote">Handled by the payment processor.</span>
    </p>
  );
}
