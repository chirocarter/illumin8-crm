// The "Learn More or Book $50" form's offer: the $220 two-appointment
// new-patient exam bundle, at $50 for printouts from the outreach department.
//
// Everything a person reads about the offer comes from here, so a price or
// link change is one edit. Pure data, no React.
//
// BOOKING ROUTE: the button goes to the same Stripe payment link as the
// department's printed QR code. Stripe takes the $50, then sends people to
// illumin8chiro.com/events to pick a location and time (that page has no
// payment step of its own; it links straight to each location's scheduler).
// The redirect after payment is configured in Stripe, not here.

export const BUNDLE_OFFER = {
  bookingUrl: "https://book.stripe.com/bJe5kD8KMbHxcKM0Qt5gc03",
  price: 50,
  regularPrice: 220,
  visits: [
    {
      title: "Chiropractic exam & scans",
      items: ["Consultation & health history", "Posture analysis", "ThermPix thermal scan & surface EMG"],
    },
    {
      title: "Results & first adjustment",
      items: ["Your chiropractor walks you through every result", "A personalized care plan", "Your first chiropractic adjustment"],
    },
  ],
  /** One line for the page: what the two visits add up to. */
  summary: "a full chiropractic exam and scans, then your results, your care plan and your first adjustment.",
} as const;

/** What we do — the "learn more" side, condensed from illumin8chiro.com. */
export const ABOUT_ILLUMIN8 = {
  tagline: "Illuminate your life.",
  summary:
    "Many chiropractic offices focus on temporary relief. Our chiropractors focus on restoring the structure and function of the spine — correcting posture, rebuilding spinal curves and improving nervous-system function, so your body can move and heal long term.",
  steps: [
    { title: "Advanced posture & spinal analysis", body: "Posture patterns, inflammation, spinal curves and range of motion." },
    { title: "Corrective alignment & education", body: "A care plan built to restore alignment — and you'll understand every step." },
    { title: "Long-term restoration", body: "Correcting the underlying structure, not just the symptoms." },
  ],
  helpsWith: ["Back pain", "Neck pain", "Sciatica", "Headaches & migraines", "Vertigo", "Car accident injuries"],
  insurance: "Accepting most insurances and personal injury cases. Convenient cash options.",
} as const;
