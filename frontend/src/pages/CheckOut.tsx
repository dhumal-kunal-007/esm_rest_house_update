import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api";
import { getWhatsAppChatUrl } from "../whatsapp";
import CheckoutFeedback, {
  type CheckoutFeedbackContext,
  type CheckoutFeedbackValues,
} from "./CheckoutFeedback";
import RefundMemo, {
  type RefundMemoData,
  type RefundMemoDraft,
  type RefundMemoGuestType,
} from "./RefundMemo";

interface CheckOutProps {
  userId: string;
  userRole: string;
  userName: string;
  onBack: () => void;
}

interface EligibleGuest {
  allotment_id: string;
  booking_id: string;
  booking_reference: string;
  guest_id: string;
  guest_name: string;
  booking_person_name?: string | null;
  booking_person_address?: string | null;
  guest_type?: RefundMemoGuestType | null;
  mobile_number?: string;
  room_id: string;
  room_number: string;
  room_status?: string;
  bed_id?: string | null;
  bed_number?: number | null;
  bed_status?: string | null;
  check_in_date: string;
  expected_check_out_date: string;
  allotment_status: string;
  check_in_id?: string;
  check_in_time?: string;
  check_in_status:
    | "NOT_CHECKED_IN"
    | "CHECKED_IN";
  is_early_checkout?: boolean;
  is_final_checkout_group?: boolean;
  has_prior_early_checkout?: boolean;
  room_group_guests?: EligibleGuest[];
}

interface CheckoutRecord {
  id: string;
  booking_id: string;
  guest_id: string;
  allotment_id: string;
  check_out_time: string;
}

interface PendingBill {
  checkout_id: string;
  booking_id: string;
  guest_id: string;
  allotment_id: string;
  check_out_time: string;
  booking_reference: string;
  booking_person_name?: string | null;
  guest_type?: RefundMemoGuestType | null;
  guest_name: string;
  mobile_number?: string | null;
  room_id: string;
  room_number: string;
  bed_id?: string | null;
  bed_number?: number | null;
  check_in_date: string;
  expected_check_out_date: string;
}

interface BillDetails {
  bill_date?: string;
  bill_number: string;
  room_charges: number;
  food_charges: number;
  other_charges: number;
  discount_amount: number;
  total_amount: number;
  payment_status: string;
  payment_method: string;
  booking_reference?: string;
  booking_person_name?: string;
  booking_guest_names?: string;
  guest_name?: string;
  mobile_number?: string;
  room_number?: string;
  bed_number?: number | null;
  category_name?: string;
  accommodation_type?: string;
  check_in_date?: string;
  check_out_time?: string;
  stay_days?: number;
  accommodation_rate?: number;
  accommodation_units?: number;
  accommodation_unit_days?: number;
  additional_person_count?: number;
  additional_person_rate?: number;
  additional_person_charges?: number;
  other_relation_count?: number;
  other_relation_rate?: number;
  other_relation_charges?: number;
  pricing_source?: string;
  legacy_daily_rate?: number | null;
  legacy_authorization_reason?: string | null;
  legacy_authorized_at?: string | null;
}

interface GeneratedBillResponse {
  success: boolean;
  message?: string;
  bill?: BillDetails;
  details?: Partial<BillDetails>;
}

type LegacyRateCardRates = Partial<
  Record<"ESM" | "SERVING" | "CIVILIAN", number | string | null>
>;

const isLegacyRateCardRates = (
  value: unknown
): value is LegacyRateCardRates => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  return ["ESM", "SERVING", "CIVILIAN"].every((guestType) => {
    const rate = Reflect.get(value, guestType);
    return (
      rate === undefined ||
      rate === null ||
      typeof rate === "number" ||
      typeof rate === "string"
    );
  });
};

interface PaymentRecord {
  id: string;
  amount: number;
  payment_status: string;
  payment_method?: string;
  transaction_number?: string;
}

interface RefundRecord {
  id: string;
  booking_id: string;
  payment_id: string;
  original_amount: number;
  used_amount: number;
  deduction_amount: number;
  refund_amount: number;
  refund_status: string;
}

interface RefundMemoRecord {
  id: string;
  refund_id: string;
  memo_number: string;
  memo_date: string;
  amount: number;
  generated_by: string;
}

interface FeedbackNotification {
  id: string;
  booking_id: string;
  guest_id: string;
  channel: string;
  notification_status: string;
  sent_at?: string | null;
  created_at: string;
}

type CheckoutType =
  | "SCHEDULED"
  | "PRE_CHECKOUT";

type PreCheckoutStep =
  | "REFUND_CHOICE"
  | "REFUND_CALCULATION"
  | "REFUND_MEMO"
  | "FEEDBACK"
  | "CHECKOUT"
  | "WHATSAPP"
  | null;

type RefundChoice = "YES" | "NO" | null;

const CheckOut: React.FC<CheckOutProps> = ({
  userId,
  userRole,
  userName,
  onBack,
}) => {
  const [guests, setGuests] = useState<
    EligibleGuest[]
  >([]);

  const [selectedGuest, setSelectedGuest] =
    useState<EligibleGuest | null>(null);

  const [checkoutType, setCheckoutType] =
    useState<CheckoutType | null>(null);

  const [remarks, setRemarks] = useState("");

  const [additionalPersonCount, setAdditionalPersonCount] =
    useState(0);

  const [otherRelationCount, setOtherRelationCount] =
    useState(0);

  const [completedCheckout, setCompletedCheckout] =
    useState<CheckoutRecord | null>(null);

  const [generatedBill, setGeneratedBill] =
    useState<BillDetails | null>(null);

  const billPreviewRef = useRef<HTMLDivElement>(null);
  const autoBillGenerationKey = useRef<string | null>(null);
  const autoSavedBillNumber = useRef<string | null>(null);
  const resumePendingBillId = useRef<string | null>(null);

  const [billPdfStatus, setBillPdfStatus] = useState<{
    billNumber: string;
    filePath?: string;
    error?: string;
    saving: boolean;
  } | null>(null);

  const [showBillSection, setShowBillSection] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [loadingGuests, setLoadingGuests] =
    useState(true);

  const [pendingBills, setPendingBills] =
    useState<PendingBill[]>([]);

  const [loadingPendingBills, setLoadingPendingBills] =
    useState(false);

  const [error, setError] =
    useState("");

  const [legacyPricingRequired, setLegacyPricingRequired] =
    useState(false);

  const [legacyDailyRate, setLegacyDailyRate] =
    useState("");

  const [legacyGuestType, setLegacyGuestType] =
    useState("ESM");

  const [legacyRateCardRates, setLegacyRateCardRates] =
    useState<LegacyRateCardRates>({});

  const [legacyAuthorizationReason, setLegacyAuthorizationReason] =
    useState("");

  const [confirmLegacyRate, setConfirmLegacyRate] =
    useState(false);

  const [success, setSuccess] =
    useState("");

  // ---------------------------------------------------------
  // PAYMENT / REFUND STATE
  // ---------------------------------------------------------

  const [payment, setPayment] =
    useState<PaymentRecord | null>(null);

  const [refund, setRefund] =
    useState<RefundRecord | null>(null);

  const [refundMemo, setRefundMemo] =
    useState<RefundMemoRecord | null>(null);

  const [refundMemoDraft, setRefundMemoDraft] =
    useState<RefundMemoDraft | null>(null);

  const [feedbackNotification, setFeedbackNotification] =
    useState<FeedbackNotification | null>(
      null
    );

  const [refundAdjustment, setRefundAdjustment] =
    useState(0);

  const [refundReason, setRefundReason] =
    useState("");

  const [refundRemarks, setRefundRemarks] =
    useState("");

  const [preCheckoutStep, setPreCheckoutStep] =
    useState<PreCheckoutStep>(null);

  const [preCheckoutRefundChoice, setPreCheckoutRefundChoice] =
    useState<RefundChoice>(null);

  const [checkoutFeedbackContext, setCheckoutFeedbackContext] =
    useState<CheckoutFeedbackContext | null>(null);

  const [checkoutFeedbackDraft, setCheckoutFeedbackDraft] =
    useState<CheckoutFeedbackValues | null>(null);

  useEffect(() => {
    if (generatedBill && showBillSection) {
      billPreviewRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [generatedBill, showBillSection]);

  const saveBillPdf = useCallback(async (billNumber: string) => {
    setBillPdfStatus({ billNumber, saving: true });
    try {
      if (!window.electronAPI) {
        throw new Error(
          "Automatic bill PDF saving is available only in the ESM Rest House desktop app."
        );
      }
      const result = await window.electronAPI.saveBillPdf(billNumber);
      setBillPdfStatus({
        billNumber,
        filePath: result.filePath,
        saving: false,
      });
    } catch (saveError) {
      console.error("Automatic bill PDF save failed:", saveError);
      setBillPdfStatus({
        billNumber,
        error:
          saveError instanceof Error
            ? saveError.message
            : "Unable to save the bill PDF.",
        saving: false,
      });
    }
  }, []);

  useEffect(() => {
    if (
      !generatedBill ||
      !showBillSection ||
      autoSavedBillNumber.current === generatedBill.bill_number
    ) {
      return;
    }

    autoSavedBillNumber.current = generatedBill.bill_number;
    void saveBillPdf(generatedBill.bill_number);
  }, [generatedBill, saveBillPdf, showBillSection]);

  // ---------------------------------------------------------
  // COMMON RESPONSE HELPER
  // ---------------------------------------------------------

  const readJson = useCallback(async (
    response: Response
  ) => {
    const data = await response.json();

    if (!response.ok) {
      const errorDetail =
        data?.error ||
        data?.message ||
        "Request failed.";

      const requestError = new Error(errorDetail);
      Object.assign(requestError, {
        code: data?.code,
        rateCardRates: data?.rate_card_rates,
      });
      throw requestError;
    }

    return data;
  }, []);

  // ---------------------------------------------------------
  // LOAD ELIGIBLE GUESTS
  // ---------------------------------------------------------

  const loadEligibleGuests = async () => {
    try {
      setLoadingGuests(true);
      setError("");

      const response = await apiFetch(
        "http://localhost:5000/api/check-outs/eligible"
      );

      const data = await readJson(
        response
      );

      /*
       * Current backend returns:
       *
       * {
       *   value: [...],
       *   Count: 1
       * }
       */

      const guestList: EligibleGuest[] =
        Array.isArray(data)
          ? data
          : Array.isArray(data?.value)
          ? data.value
          : Array.isArray(data?.guests)
          ? data.guests
          : [];

      setGuests(guestList);
    } catch (err: any) {
      console.error(
        "Load checkout guests error:",
        err
      );

      setError(
        err?.message ||
          "Unable to load checked-in guests."
      );
    } finally {
      setLoadingGuests(false);
    }
  };

  const loadPendingBills = async () => {
    if (userRole !== "ADMIN") {
      setPendingBills([]);
      return;
    }

    try {
      setLoadingPendingBills(true);
      const response = await apiFetch(
        "http://localhost:5000/api/check-outs/pending-bills"
      );
      const data = await readJson(response);
      setPendingBills(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      console.error("Load pending final bills error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load pending final bills."
      );
    } finally {
      setLoadingPendingBills(false);
    }
  };

  useEffect(() => {
    void loadEligibleGuests();
    void loadPendingBills();
  }, []);

  const checkoutGroups = guests.reduce<EligibleGuest[]>((groups, guest) => {
    if (guest.bed_id) {
      groups.push(guest);
      return groups;
    }

    const existingGroup = groups.find(
      (group) =>
        !group.bed_id &&
        group.booking_id === guest.booking_id &&
        group.room_id === guest.room_id
    );
    if (existingGroup) {
      existingGroup.room_group_guests?.push(guest);
    } else {
      groups.push({ ...guest, room_group_guests: [guest] });
    }
    return groups;
  }, []);

  // ---------------------------------------------------------
  // LOAD PAYMENT FOR SELECTED BOOKING
  // ---------------------------------------------------------

  const loadPaymentForBooking = async (
    bookingId: string
  ) => {
    try {
      const response = await apiFetch(
        `http://localhost:5000/api/payments/booking/${bookingId}`
      );

      const data = await readJson(
        response
      );

      /*
       * Payment route may return:
       *
       * { payments: [...] }
       * or { value: [...] }
       * or directly [...]
       */

      const paymentList =
        Array.isArray(data)
          ? data
          : Array.isArray(data?.payments)
          ? data.payments
          : Array.isArray(data?.value)
          ? data.value
          : [];

      if (
        paymentList.length === 0
      ) {
        setPayment(null);
        return null;
      }

      const successfulStatuses = [
        "SUCCESS",
        "COMPLETED",
        "PAID",
        "RECEIVED",
      ];

      const successfulPayment =
        paymentList.find(
          (item: any) =>
            successfulStatuses.includes(
              String(
                item.payment_status ||
                  ""
              ).toUpperCase()
            )
        ) || paymentList[0];

      const normalizedPayment: PaymentRecord =
        {
          id: successfulPayment.id,
          amount: Number(
            successfulPayment.amount || 0
          ),
          payment_status:
            successfulPayment.payment_status,
          payment_method:
            successfulPayment.payment_method,
          transaction_number:
            successfulPayment.transaction_number,
        };

      setPayment(
        normalizedPayment
      );

      return normalizedPayment;
    } catch (err: any) {
      console.error(
        "Load booking payment error:",
        err
      );

      setPayment(null);

      throw new Error(
        err?.message ||
          "Unable to load booking payment."
      );
    }
  };

  const handleResumePendingBill = (pendingBill: PendingBill) => {
    const guest: EligibleGuest = {
      allotment_id: pendingBill.allotment_id,
      booking_id: pendingBill.booking_id,
      booking_reference: pendingBill.booking_reference,
      guest_id: pendingBill.guest_id,
      guest_name: pendingBill.guest_name,
      booking_person_name: pendingBill.booking_person_name,
      guest_type: pendingBill.guest_type,
      mobile_number: pendingBill.mobile_number ?? undefined,
      room_id: pendingBill.room_id,
      room_number: pendingBill.room_number,
      bed_id: pendingBill.bed_id,
      bed_number: pendingBill.bed_number,
      check_in_date: pendingBill.check_in_date,
      expected_check_out_date: pendingBill.expected_check_out_date,
      allotment_status: "ALLOTTED",
      check_in_id: "",
      check_in_time: "",
      check_in_status: "CHECKED_IN",
    };

    resumePendingBillId.current = pendingBill.checkout_id;
    setSelectedGuest(guest);
    setCheckoutType("SCHEDULED");
    setCompletedCheckout({
      id: pendingBill.checkout_id,
      booking_id: pendingBill.booking_id,
      guest_id: pendingBill.guest_id,
      allotment_id: pendingBill.allotment_id,
      check_out_time: pendingBill.check_out_time,
    });
    setGeneratedBill(null);
    setLegacyPricingRequired(false);
    setLegacyDailyRate("");
    setLegacyRateCardRates({});
    setLegacyGuestType("ESM");
    setLegacyAuthorizationReason("");
    setConfirmLegacyRate(false);
    setError("");
    setSuccess(
      `Resuming final bill for ${pendingBill.booking_reference}.`
    );
  };

  // ---------------------------------------------------------
  // SELECT GUEST
  // ---------------------------------------------------------

  const handleSelectGuest = async (
    guest: EligibleGuest
  ) => {
    resumePendingBillId.current = null;
    setSelectedGuest(guest);

    setCheckoutType(null);

    setError("");
    setSuccess("");

    setCompletedCheckout(null);
    setGeneratedBill(null);
    setShowBillSection(false);
    setLegacyPricingRequired(false);
    setLegacyDailyRate("");
    setLegacyRateCardRates({});
    setLegacyGuestType("ESM");
    setLegacyAuthorizationReason("");
    setConfirmLegacyRate(false);

    setPayment(null);
    setRefund(null);
    setRefundMemo(null);
    setRefundMemoDraft(null);
    setFeedbackNotification(null);

    setRefundAdjustment(0);
    setRefundReason("");
    setRefundRemarks("");
    setPreCheckoutStep(null);
    setPreCheckoutRefundChoice(null);

    setCheckoutFeedbackContext(null);
    setCheckoutFeedbackDraft(null);

    try {
      setLoading(true);

      await loadPaymentForBooking(
        guest.booking_id
      );
    } catch (err: any) {
      setError(
        err?.message ||
          "Unable to load payment details."
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // SELECT CHECKOUT TYPE
  // ---------------------------------------------------------

  const handleCheckoutType = async (
    type: CheckoutType
  ) => {
    if (!selectedGuest) {
      setError(
        "Please select a guest first."
      );
      return;
    }

    setCheckoutType(type);

    setError("");
    setSuccess("");

    if (type === "PRE_CHECKOUT") {
      if (!selectedGuest.is_final_checkout_group) {
        setPreCheckoutStep("CHECKOUT");
      } else {
        setPreCheckoutRefundChoice(null);
        setPreCheckoutStep("REFUND_CHOICE");
      }
    } else {
      if (selectedGuest.is_early_checkout || selectedGuest.has_prior_early_checkout) {
        setError(
          "This is an early check-out or the booking has an earlier early departure. Use Pre Check-Out."
        );
        return;
      }
      await openFinalCheckoutFeedback();
    }
  };

  const openFinalCheckoutFeedback = async () => {
    if (!selectedGuest) {
      setError("Please select a guest.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await apiFetch(
        `http://localhost:5000/api/checkout-feedback/${selectedGuest.booking_id}/context`
      );
      const data = await readJson(response);
      const context = data?.context as CheckoutFeedbackContext & {
        is_final_guest_checkout?: boolean;
      };
      if (!context || !Array.isArray(context.guests)) {
        throw new Error("Booking feedback details were not returned.");
      }

      setCheckoutFeedbackContext(context);
      setPreCheckoutStep(
        context.is_final_guest_checkout && !context.feedback
          ? "FEEDBACK"
          : "CHECKOUT"
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to prepare the final checkout step."
      );
    } finally {
      setLoading(false);
    }
  };

  const saveCheckoutFeedback = async (
    values?: CheckoutFeedbackValues
  ) => {
    if (!selectedGuest) {
      setError("Please select a guest.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await apiFetch(
        `http://localhost:5000/api/checkout-feedback/${selectedGuest.booking_id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            values
              ? {
                  ...values,
                  comments: values.comments.trim() || null,
                }
              : { skip: true }
          ),
        }
      );
      const data = await readJson(response);
      if (!data?.feedback) {
        throw new Error("Checkout feedback was not saved.");
      }
      setCheckoutFeedbackContext((current) =>
        current ? { ...current, feedback: data.feedback } : current
      );
      setPreCheckoutStep("CHECKOUT");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save checkout feedback."
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // REFUND CALCULATION API
  // ---------------------------------------------------------

  const calculateRefund = async () => {
    if (!selectedGuest) {
      setError(
        "Please select a guest."
      );
      return;
    }

    if (!payment) {
      setError(
        "No successful payment found for this booking."
      );
      return;
    }

    if (refundAdjustment < 0) {
      setError(
        "Adjustment amount cannot be negative."
      );
      return;
    }

    if (
      refundAdjustment >
      Number(payment.amount)
    ) {
      setError(
        "Adjustment amount cannot exceed the payment amount."
      );
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const response = await apiFetch(
        "http://localhost:5000/api/refunds/calculate",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            booking_id:
              selectedGuest.booking_id,

            payment_id:
              payment.id,

            original_amount:
              Number(payment.amount),

            used_amount: 0,

            deduction_amount:
              refundAdjustment,

            refund_reason:
              refundReason.trim() ||
              "Pre Check-Out",

            calculated_by: userId,

            remarks:
              refundRemarks.trim() ||
              null,
          }),
        }
      );

      const data = await readJson(
        response
      );

      if (!data?.refund?.id) {
        throw new Error(
          "Refund was calculated but refund ID was not returned."
        );
      }

      setRefund(
        data.refund
      );

      setSuccess(
        `Refund calculated successfully. Refund amount: ₹${Number(
          data.refund.refund_amount || 0
        ).toFixed(2)}`
      );

      setPreCheckoutStep(
        "REFUND_MEMO"
      );
    } catch (err: any) {
      console.error(
        "Refund calculation error:",
        err
      );

      setError(
        err?.message ||
          "Unable to calculate refund."
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // REFUND MEMO API
  // ---------------------------------------------------------

  const createRefundMemo = async (
    memo: RefundMemoData
  ) => {
    if (!refund) {
      setError(
        "Refund calculation is required before creating the memo."
      );
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const response = await apiFetch(
        `http://localhost:5000/api/refunds/${refund.id}/memo`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            memo_number:
              memo.memoNumber,

            amount: memo.refundableAmount,

            generated_by:
              userId,

            memo_date:
              memo.memoDate,

            remarks:
              [memo.memoType, memo.remarks]
                .filter(Boolean)
                .join(" · ") ||
              "Pre Check-Out Refund Memo",
          }),
        }
      );

      const data = await readJson(
        response
      );

      if (
        !data?.refund_memo?.id
      ) {
        throw new Error(
          "Refund memo was created but memo details were not returned."
        );
      }

      setRefundMemo(
        data.refund_memo
      );

      setSuccess(
        "Refund memo generated successfully."
      );

      await openFinalCheckoutFeedback();
    } catch (err: any) {
      console.error(
        "Refund memo error:",
        err
      );

      setError(
        err?.message ||
          "Unable to create refund memo."
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // ACTUAL CHECK-OUT API
  // ---------------------------------------------------------

  const processCheckOut = async () => {
    if (!selectedGuest) {
      setError(
        "Please select a guest."
      );
      return;
    }

    if (
      selectedGuest.check_in_status !==
      "CHECKED_IN"
    ) {
      setError(
        "Only checked-in guests can be checked out."
      );
      return;
    }

    if (!checkoutType) {
      setError(
        "Please select Scheduled Check-Out or Pre Check-Out."
      );
      return;
    }

    // Final-group early check-out needs a refund decision; YES requires a memo.
    const isNonFinalBookingGroup =
      selectedGuest.is_final_checkout_group === false;
    if (checkoutType === "PRE_CHECKOUT" && !isNonFinalBookingGroup && !refundMemo) {
      if (preCheckoutRefundChoice === "YES") {
        setError(
          "Refund memo must be generated before Pre Check-Out."
        );
        return;
      }
      if (preCheckoutRefundChoice !== "NO") {
        setError("Please choose whether to process a refund.");
        return;
      }
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const isRoomGroup = !selectedGuest.bed_id;
      const response = await apiFetch(
        isRoomGroup
          ? "http://localhost:5000/api/check-outs/room"
          : "http://localhost:5000/api/check-outs",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(isRoomGroup ? {
            booking_id: selectedGuest.booking_id,
            room_id: selectedGuest.room_id,
            checked_out_by: userId,
            checkout_type: checkoutType,
            skip_refund:
              checkoutType === "PRE_CHECKOUT" &&
              preCheckoutRefundChoice === "NO",
            remarks:
              remarks.trim() ||
              (checkoutType === "PRE_CHECKOUT"
                ? "Pre Check-Out"
                : "Scheduled Check-Out"),
          } : {
            booking_id:
              selectedGuest.booking_id,

            guest_id:
              selectedGuest.guest_id,

            allotment_id:
              selectedGuest.allotment_id,

            checked_out_by:
              userId,

            checkout_type:
              checkoutType,

            skip_refund:
              checkoutType === "PRE_CHECKOUT" &&
              preCheckoutRefundChoice === "NO",

            remarks:
              remarks.trim() ||
              (checkoutType ===
              "PRE_CHECKOUT"
                ? "Pre Check-Out"
                : "Scheduled Check-Out"),
          }),
        }
      );

      const data = await readJson(
        response
      );

      const checkoutRecords: CheckoutRecord[] =
        Array.isArray(data.checkouts)
          ? data.checkouts
          : [];
      const checkout =
        checkoutRecords.find(
          (record) =>
            record.guest_id === selectedGuest.guest_id
        ) || data.checkout;

      if (
        !checkout?.id ||
        checkout.guest_id !== selectedGuest.guest_id
      ) {
        throw new Error(
          "Check-Out completed, but a checkout record for the selected guest was not returned."
        );
      }

      if (data.booking_complete !== true) {
        setSuccess(
          "Room check-out completed. The final bill and any booking refund will be processed after the remaining room/bed groups check out."
        );
        setSelectedGuest(null);
        setCheckoutType(null);
        setPreCheckoutStep(null);
        setCheckoutFeedbackContext(null);
        setCheckoutFeedbackDraft(null);
        setPayment(null);
        setRefund(null);
        setRefundMemo(null);
        setRefundMemoDraft(null);
        await loadEligibleGuests();
        return;
      }

      setCompletedCheckout(
        checkout
      );

      if (
        checkoutType ===
        "PRE_CHECKOUT"
      ) {
        setSuccess(
          "Pre Check-Out completed. Generating the final bill..."
        );
      } else {
        setSuccess(
          "Scheduled Check-Out completed successfully."
        );
      }

      await generateBill(
        checkout.id
      );
    } catch (err: any) {
      console.error(
        "Checkout error:",
        err
      );

      if (
        err?.message ===
        "Complete or skip the booking feedback form before the final guest checkout."
      ) {
        await openFinalCheckoutFeedback();
        return;
      }

      setError(
        err?.message ||
          "Unable to complete Check-Out."
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // BILL GENERATION
  // ---------------------------------------------------------

  const generateBill = useCallback(async (
    checkoutId: string
  ) => {
    if (!selectedGuest) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await apiFetch(
        "http://localhost:5000/api/bills/generate",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            booking_id:
              selectedGuest.booking_id,

            guest_id:
              selectedGuest.guest_id,

            check_out_id:
              checkoutId,

            generated_by:
              userId,

            is_serving:
              false,

            additional_person_count:
              additionalPersonCount,

            other_relation_count:
              otherRelationCount,

            ...(legacyPricingRequired
              ? {
                  legacy_daily_rate:
                    legacyDailyRate,
                  legacy_guest_type:
                    legacyGuestType,
                  legacy_authorization_reason:
                    legacyAuthorizationReason,
                  confirm_legacy_rate:
                    confirmLegacyRate,
                }
              : {}),
          }),
        }
      );

      const data: GeneratedBillResponse =
        await readJson(response);

      if (!data.bill) {
        throw new Error(
          "Bill generation completed but bill details were not returned."
        );
      }

      setGeneratedBill(
        {
          ...data.bill,
          ...data.details,
        }
      );
      setPendingBills((current) =>
        current.filter(
          (pendingBill) =>
            pendingBill.booking_id !== selectedGuest.booking_id
        )
      );

      setLegacyPricingRequired(false);
      setShowBillSection(
        true
      );

      if (checkoutType === "PRE_CHECKOUT") {
        setPreCheckoutStep("WHATSAPP");
      }

      setSuccess(
        checkoutType === "PRE_CHECKOUT"
          ? "Pre Check-Out and final bill completed successfully."
          : "Check-Out and final bill completed successfully."
      );
    } catch (err: unknown) {
      console.error(
        "Bill generation error:",
        err
      );

      if (
        err instanceof Error &&
        "code" in err &&
        err.code === "LEGACY_PRICING_REQUIRED"
      ) {
        const rateCardRates =
          "rateCardRates" in err &&
          isLegacyRateCardRates(err.rateCardRates)
            ? err.rateCardRates
            : {};
        const suggestedRate =
          rateCardRates?.[
            legacyGuestType as keyof LegacyRateCardRates
          ];
        setLegacyRateCardRates(rateCardRates ?? {});
        setLegacyDailyRate(
          suggestedRate === null || suggestedRate === undefined
            ? ""
            : String(suggestedRate)
        );
        setLegacyPricingRequired(true);
        setError("");
      } else {
        setError(
          (err instanceof Error ? err.message : "") ||
            "Unable to generate final bill."
        );
      }
    } finally {
      setLoading(false);
    }
  }, [
    additionalPersonCount,
    checkoutType,
    confirmLegacyRate,
    legacyAuthorizationReason,
    legacyDailyRate,
    legacyGuestType,
    legacyPricingRequired,
    otherRelationCount,
    readJson,
    selectedGuest,
    setError,
    setGeneratedBill,
    setLegacyDailyRate,
    setLegacyPricingRequired,
    setLegacyRateCardRates,
    setPendingBills,
    setPreCheckoutStep,
    setShowBillSection,
    setSuccess,
    userId,
  ]);

  useEffect(() => {
    if (
      !completedCheckout ||
      !selectedGuest ||
      loading ||
      resumePendingBillId.current !== completedCheckout.id
    ) {
      return;
    }

    resumePendingBillId.current = null;
    void generateBill(completedCheckout.id);
  }, [completedCheckout, generateBill, loading, selectedGuest]);

  useEffect(() => {
    if (
      !completedCheckout ||
      generatedBill ||
      !legacyPricingRequired ||
      userRole !== "ADMIN" ||
      loading ||
      !legacyDailyRate ||
      Number(legacyDailyRate) <= 0 ||
      legacyAuthorizationReason.trim().length < 15 ||
      !confirmLegacyRate
    ) {
      return;
    }

    const generationKey = JSON.stringify([
      completedCheckout.id,
      legacyDailyRate,
      legacyGuestType,
      legacyAuthorizationReason.trim(),
      confirmLegacyRate,
      additionalPersonCount,
      otherRelationCount,
    ]);

    if (autoBillGenerationKey.current === generationKey) {
      return;
    }

    autoBillGenerationKey.current = generationKey;
    void generateBill(completedCheckout.id);
  }, [
    additionalPersonCount,
    completedCheckout,
    confirmLegacyRate,
    generatedBill,
    legacyAuthorizationReason,
    legacyDailyRate,
    legacyGuestType,
    legacyPricingRequired,
    loading,
    otherRelationCount,
    userRole,
    generateBill,
  ]);

  // ---------------------------------------------------------
  // WHATSAPP FEEDBACK API
  // ---------------------------------------------------------

  const createWhatsAppFeedback = async (
    status:
      | "PENDING"
      | "SENT"
      | "SKIPPED"
  ) => {
    if (!selectedGuest) {
      setError(
        "Please select a guest."
      );
      return;
    }

    if (
      status === "SENT" &&
      !window.confirm(
        "Did you send the feedback message to this guest in WhatsApp?"
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const response = await apiFetch(
        "http://localhost:5000/api/feedback-notifications",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            booking_id:
              selectedGuest.booking_id,

            guest_id:
              selectedGuest.guest_id,

            notification_status:
              status,
          }),
        }
      );

      const data = await readJson(
        response
      );

      if (
        !data?.notification?.id
      ) {
        throw new Error(
          "Feedback notification was not returned."
        );
      }

      setFeedbackNotification(
        data.notification
      );

      if (status === "SENT") {
        setSuccess(
          "WhatsApp feedback marked as SENT. Workflow completed."
        );
      } else if (
        status === "SKIPPED"
      ) {
        setSuccess(
          "WhatsApp feedback marked as SKIPPED. Workflow completed."
        );
      } else {
        setSuccess(
          "WhatsApp feedback notification created."
        );
      }
    } catch (err: any) {
      console.error(
        "WhatsApp feedback error:",
        err
      );

      setError(
        err?.message ||
          "Unable to create WhatsApp feedback notification."
      );
    } finally {
      setLoading(false);
    }
  };

  const openWhatsAppFeedback = () => {
    if (!selectedGuest?.mobile_number) {
      setError(
        "The guest does not have a mobile number for WhatsApp."
      );
      return;
    }

    const message =
      `Hello ${selectedGuest.guest_name}, thank you for staying at ESM Rest House. Please share your feedback about your stay. Booking reference: ${selectedGuest.booking_reference}`;

    try {
      window.open(
        getWhatsAppChatUrl(
          selectedGuest.mobile_number,
          message
        ),
        "_blank",
        "noopener,noreferrer"
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to open WhatsApp."
      );
    }
  };

  // ---------------------------------------------------------
  // PRINT
  // ---------------------------------------------------------

  const printBill = () => {
    window.print();
  };

  // ---------------------------------------------------------
  // RESET
  // ---------------------------------------------------------

  const resetSelection = () => {
    setSelectedGuest(null);

    setCheckoutType(null);

    setCompletedCheckout(null);

    setGeneratedBill(null);

    setLegacyPricingRequired(false);

    setLegacyDailyRate("");

    setLegacyGuestType("ESM");

    setLegacyRateCardRates({});

    setLegacyAuthorizationReason("");

    setConfirmLegacyRate(false);

    setShowBillSection(false);

    setPayment(null);

    setRefund(null);

    setRefundMemo(null);

    setRefundMemoDraft(null);

    setFeedbackNotification(
      null
    );

    setRefundAdjustment(0);

    setRefundReason("");

    setRefundRemarks("");

    setPreCheckoutStep(null);

    setPreCheckoutRefundChoice(null);

    setCheckoutFeedbackContext(null);

    setCheckoutFeedbackDraft(null);

    setError("");

    setSuccess("");

    setRemarks("");
  };

  // ---------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f7fb",
        padding: "42px 7%",
        color: "#17233c",
      }}
    >
      {/* HEADER */}

      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          marginBottom: 30,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 36,
              fontWeight: 800,
            }}
          >
            Guest Check-Out
          </h1>

          <p
            style={{
              marginTop: 8,
              color: "#64748b",
              fontSize: 16,
            }}
          >
            Complete scheduled or
            pre check-out process
          </p>
        </div>

        <button
          onClick={onBack}
          style={{
            padding:
              "12px 24px",
            borderRadius: 8,
            border:
              "1px solid #cbd5e1",
            background: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          BACK TO DASHBOARD
        </button>
      </div>

      {/* ERROR */}

      {error && (
        <div
          style={{
            background: "#fff1f2",
            border:
              "1px solid #fecdd3",
            color: "#be123c",
            padding: 16,
            borderRadius: 10,
            marginBottom: 20,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {/* SUCCESS */}

      {success && (
        <div
          style={{
            background: "#ecfdf5",
            border:
              "1px solid #a7f3d0",
            color: "#047857",
            padding: 16,
            borderRadius: 10,
            marginBottom: 20,
            fontWeight: 600,
          }}
        >
          {success}
        </div>
      )}

      {!selectedGuest && userRole === "ADMIN" && (
        <div
          style={{
            background: "#fff",
            borderRadius: 18,
            border: "1px solid #fbbf24",
            padding: 26,
            marginBottom: 22,
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: 21 }}>
            Pending Final Bills
          </h2>
          <p style={{ color: "#64748b", marginBottom: 18 }}>
            Completed check-outs without a generated bill can be resumed here.
          </p>
          {loadingPendingBills ? (
            <p style={{ color: "#64748b" }}>Loading pending bills...</p>
          ) : pendingBills.length === 0 ? (
            <p style={{ color: "#64748b", marginBottom: 0 }}>
              No pending final bills.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {pendingBills.map((pendingBill) => (
                <div
                  key={pendingBill.checkout_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 16,
                    padding: 16,
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                  }}
                >
                  <div>
                    <strong>{pendingBill.booking_reference}</strong>
                    <div style={{ marginTop: 4 }}>
                      {pendingBill.guest_name} · {pendingBill.room_number}
                      {pendingBill.bed_number
                        ? ` · Bed ${pendingBill.bed_number}`
                        : ""}
                    </div>
                    <small style={{ color: "#64748b" }}>
                      Checked out:{" "}
                      {new Date(pendingBill.check_out_time).toLocaleString(
                        "en-IN"
                      )}
                    </small>
                  </div>
                  <button
                    disabled={loading}
                    onClick={() => handleResumePendingBill(pendingBill)}
                    style={{
                      padding: "10px 16px",
                      border: "none",
                      borderRadius: 8,
                      background: "#1f4d36",
                      color: "#fff",
                      fontWeight: 700,
                      cursor: loading ? "wait" : "pointer",
                    }}
                  >
                    RESUME BILL
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CURRENT OCCUPANTS */}

      {!selectedGuest && (
        <div
          style={{
            background: "#fff",
            borderRadius: 18,
            border:
              "1px solid #dbe3ec",
            padding: 26,
            boxShadow:
              "0 8px 24px rgba(15, 23, 42, 0.05)",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              fontSize: 21,
            }}
          >
            Current Occupants
          </h2>

          <p
            style={{
              color: "#64748b",
              marginBottom: 22,
            }}
          >
            Guests currently
            checked in
          </p>

          {loadingGuests ? (
            <div
              style={{
                padding: 30,
                textAlign: "center",
                color: "#64748b",
              }}
            >
              Loading checked-in
              guests...
            </div>
          ) : guests.length ===
            0 ? (
            <div
              style={{
                padding: 30,
                textAlign: "center",
                background:
                  "#f8fafc",
                borderRadius: 12,
                color: "#64748b",
              }}
            >
              No checked-in guests
              available.
            </div>
          ) : (
            <div
              style={{
                overflowX:
                  "auto",
                border:
                  "1px solid #dbe3ec",
                borderRadius: 14,
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse:
                    "collapse",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background:
                        "#f8fafc",
                    }}
                  >
                    {[
                      "BOOKING",
                      "GUEST",
                      "ROOM",
                      "BED",
                      "CHECK-IN",
                      "EXPECTED CHECK-OUT",
                      "STATUS",
                      "ACTION",
                    ].map(
                      (
                        heading
                      ) => (
                        <th
                          key={
                            heading
                          }
                          style={{
                            padding:
                              "16px 14px",
                            textAlign:
                              "left",
                            fontSize:
                              12,
                            color:
                              "#64748b",
                            letterSpacing:
                              0.5,
                            whiteSpace:
                              "nowrap",
                          }}
                        >
                          {
                            heading
                          }
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {checkoutGroups.map(
                    (
                      guest
                    ) => (
                      <tr
                        key={
                          guest.allotment_id
                        }
                        style={{
                          borderTop:
                            "1px solid #e2e8f0",
                        }}
                      >
                        <td
                          style={{
                            padding:
                              16,
                            fontWeight:
                              700,
                          }}
                        >
                          {
                            guest.booking_reference
                          }
                        </td>

                        <td
                          style={{
                            padding:
                              16,
                          }}
                        >
                          <div
                            style={{
                              fontWeight:
                                700,
                            }}
                          >
                            {guest.booking_person_name || guest.guest_name}
                          </div>

                          {guest.room_group_guests && (
                            <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
                              {guest.room_group_guests.map((roomGuest) => roomGuest.guest_name).join(", ")}
                            </div>
                          )}

                          {guest.mobile_number && (
                            <div
                              style={{
                                fontSize:
                                  12,
                                color:
                                  "#64748b",
                                marginTop:
                                  4,
                              }}
                            >
                              {
                                guest.mobile_number
                              }
                            </div>
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              16,
                            fontWeight:
                              600,
                          }}
                        >
                          {
                            guest.room_number
                          }
                        </td>

                        <td
                          style={{
                            padding:
                              16,
                          }}
                        >
                          {guest.bed_number
                            ? `Bed ${guest.bed_number}`
                            : "Room Only"}
                        </td>

                        <td
                          style={{
                            padding:
                              16,
                          }}
                        >
                          {new Date(
                            guest.check_in_date
                          ).toLocaleDateString(
                            "en-IN"
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              16,
                          }}
                        >
                          {new Date(
                            guest.expected_check_out_date
                          ).toLocaleDateString(
                            "en-IN"
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              16,
                          }}
                        >
                          <span
                            style={{
                              display:
                                "inline-block",
                              padding:
                                "7px 12px",
                              borderRadius:
                                999,
                              background:
                                "#ecfdf5",
                              color:
                                "#047857",
                              fontSize:
                                12,
                              fontWeight:
                                800,
                            }}
                          >
                            CHECKED IN
                          </span>
                        </td>

                        <td
                          style={{
                            padding:
                              16,
                          }}
                        >
                          <button
                            onClick={() =>
                              handleSelectGuest(
                                guest
                              )
                            }
                            style={{
                              padding:
                                "10px 16px",
                              border:
                                "none",
                              borderRadius:
                                8,
                              background:
                                "#1f4d36",
                              color:
                                "#fff",
                              fontWeight:
                                700,
                              cursor:
                                "pointer",
                            }}
                          >
                            {guest.room_group_guests ? "SELECT ROOM GROUP" : "SELECT"}
                          </button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SELECTED GUEST */}

      {selectedGuest && (
        <>
          <div
            style={{
              background: "#fff",
              borderRadius: 18,
              border:
                "1px solid #dbe3ec",
              padding: 28,
              marginBottom: 22,
            }}
          >
            <div
              style={{
                display:
                  "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "flex-start",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    color:
                      "#64748b",
                    fontWeight:
                      700,
                    letterSpacing:
                      1,
                  }}
                >
                  {selectedGuest.room_group_guests ? "SELECTED ROOM GROUP" : "SELECTED GUEST"}
                </div>

                <h2
                  style={{
                    margin:
                      "7px 0 8px",
                    fontSize:
                      27,
                  }}
                >
                  {selectedGuest.booking_person_name || selectedGuest.guest_name}
                </h2>

                {selectedGuest.room_group_guests && (
                  <div style={{ color: "#475569", marginBottom: 8 }}>
                    Guests in room: {selectedGuest.room_group_guests.map((guest) => guest.guest_name).join(", ")}
                  </div>
                )}

                <div
                  style={{
                    color:
                      "#64748b",
                  }}
                >
                  Booking:{" "}
                  <strong>
                    {
                      selectedGuest.booking_reference
                    }
                  </strong>
                </div>
              </div>

              <button
                onClick={
                  resetSelection
                }
                style={{
                  padding:
                    "10px 18px",
                  borderRadius:
                    8,
                  border:
                    "1px solid #cbd5e1",
                  background:
                    "#fff",
                  fontWeight:
                    700,
                  cursor:
                    "pointer",
                }}
              >
                CHANGE GUEST
              </button>
            </div>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(4, 1fr)",
                gap: 16,
                marginTop:
                  24,
              }}
            >
              <InfoCard
                label="ROOM"
                value={
                  selectedGuest.room_number
                }
              />

              <InfoCard
                label="BED"
                value={
                  selectedGuest.bed_number
                    ? `Bed ${selectedGuest.bed_number}`
                    : "Room Only"
                }
              />

              <InfoCard
                label="CHECK-IN"
                value={new Date(
                  selectedGuest.check_in_date
                ).toLocaleDateString(
                  "en-IN"
                )}
              />

              <InfoCard
                label="EXPECTED CHECK-OUT"
                value={new Date(
                  selectedGuest.expected_check_out_date
                ).toLocaleDateString(
                  "en-IN"
                )}
              />
            </div>

            {payment && (
              <div
                style={{
                  marginTop: 20,
                  padding: 18,
                  background:
                    "#f0fdf4",
                  border:
                    "1px solid #bbf7d0",
                  borderRadius: 12,
                }}
              >
                <strong>
                  Successful Payment:
                </strong>{" "}
                ₹
                {Number(
                  payment.amount || 0
                ).toFixed(2)}
                {" • "}
                {
                  payment.payment_status
                }
              </div>
            )}
          </div>

          {/* CHECKOUT TYPE */}

          {!completedCheckout &&
            !preCheckoutStep && (
              <div
                style={{
                  background:
                    "#fff",
                  borderRadius:
                    18,
                  border:
                    "1px solid #dbe3ec",
                  padding: 28,
                  marginBottom:
                    22,
                }}
              >
                <h2
                  style={{
                    marginTop:
                      0,
                  }}
                >
                  Select Check-Out
                  Type
                </h2>

                <div
                  style={{
                    display:
                      "grid",
                    gridTemplateColumns:
                      "repeat(2, 1fr)",
                    gap: 20,
                    marginTop:
                      24,
                  }}
                >
                  <button
                    disabled={Boolean(
                      selectedGuest.is_early_checkout ||
                      (selectedGuest.is_final_checkout_group &&
                        selectedGuest.has_prior_early_checkout)
                    )}
                    onClick={() =>
                      handleCheckoutType(
                        "SCHEDULED"
                      )
                    }
                    style={{
                      textAlign:
                        "left",
                      padding:
                        24,
                      borderRadius:
                        14,
                      border:
                        checkoutType ===
                        "SCHEDULED"
                          ? "2px solid #1f4d36"
                          : "1px solid #dbe3ec",
                      background:
                        "#fff",
                      cursor:
                        selectedGuest.is_early_checkout ||
                        (selectedGuest.is_final_checkout_group &&
                          selectedGuest.has_prior_early_checkout)
                          ? "not-allowed"
                          : "pointer",
                      opacity:
                        selectedGuest.is_early_checkout ||
                        (selectedGuest.is_final_checkout_group &&
                          selectedGuest.has_prior_early_checkout)
                          ? 0.5
                          : 1,
                    }}
                  >
                    <div
                      style={{
                        fontSize:
                          14,
                        fontWeight:
                          800,
                        color:
                          "#1f4d36",
                      }}
                    >
                      SCHEDULED
                      CHECK-OUT
                    </div>

                    <h3>
                      Normal
                      Departure
                    </h3>

                    <p
                      style={{
                        color:
                          "#64748b",
                        lineHeight:
                          1.6,
                      }}
                    >
                      No refund
                      calculation.
                      Final bill
                      is generated
                      after
                      check-out.
                    </p>
                  </button>

                  <button
                    onClick={() =>
                      handleCheckoutType(
                        "PRE_CHECKOUT"
                      )
                    }
                    style={{
                      textAlign:
                        "left",
                      padding:
                        24,
                      borderRadius:
                        14,
                      border:
                        "1px solid #fde68a",
                      background:
                        "#fffbeb",
                      cursor:
                        "pointer",
                    }}
                  >
                    <div
                      style={{
                        fontSize:
                          14,
                        fontWeight:
                          800,
                        color:
                          "#92400e",
                      }}
                    >
                      PRE
                      CHECK-OUT
                    </div>

                    <h3>
                      Early
                      Departure
                    </h3>

                    <p
                      style={{
                        color:
                          "#64748b",
                        lineHeight:
                          1.6,
                      }}
                    >
                      {selectedGuest.is_final_checkout_group
                        ? "Choose whether to process a refund for this early departure."
                        : "This room/bed group can be released now. Refund and final bill are handled once, after the final group checks out."}
                    </p>
                  </button>
                </div>
              </div>
            )}

          {/* ------------------------------------------------ */}
          {/* PRE CHECKOUT - REFUND CHOICE */}
          {/* ------------------------------------------------ */}

          {checkoutType === "PRE_CHECKOUT" &&
            preCheckoutStep === "REFUND_CHOICE" && (
              <div
                style={{
                  background: "#fff",
                  borderRadius: 18,
                  border: "1px solid #dbe3ec",
                  padding: 28,
                  marginBottom: 22,
                }}
              >
                <h2 style={{ marginTop: 0 }}>Ask for refund?</h2>
                <p style={{ color: "#64748b", lineHeight: 1.6 }}>
                  Choose whether to calculate a refund and create a refund memo
                  before continuing with early check-out.
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 12,
                    marginTop: 20,
                  }}
                >
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setPreCheckoutRefundChoice("YES");
                      setPreCheckoutStep("REFUND_CALCULATION");
                      setError("");
                    }}
                    style={{
                      border: "none",
                      borderRadius: 8,
                      padding: "12px 24px",
                      background: "#92400e",
                      color: "#fff",
                      fontWeight: 800,
                      cursor: loading ? "not-allowed" : "pointer",
                    }}
                  >
                    YES — PROCESS REFUND
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setPreCheckoutRefundChoice("NO");
                      setError("");
                      void openFinalCheckoutFeedback();
                    }}
                    style={{
                      border: "1px solid #cbd5e1",
                      borderRadius: 8,
                      padding: "12px 24px",
                      background: "#f8fafc",
                      color: "#334155",
                      fontWeight: 800,
                      cursor: loading ? "not-allowed" : "pointer",
                    }}
                  >
                    NO — CONTINUE WITHOUT REFUND
                  </button>
                </div>
              </div>
            )}

          {/* ------------------------------------------------ */}
          {/* PRE CHECKOUT - REFUND CALCULATION */}
          {/* ------------------------------------------------ */}

          {checkoutType ===
            "PRE_CHECKOUT" &&
            preCheckoutStep ===
              "REFUND_CALCULATION" && (
              <div
                style={{
                  background:
                    "#fff",
                  borderRadius:
                    18,
                  border:
                    "1px solid #fde68a",
                  padding: 28,
                  marginBottom:
                    22,
                }}
              >
                <h2>
                  Refund Calculation
                </h2>

                <div
                  style={{
                    marginTop:
                      20,
                    padding:
                      18,
                    background:
                      "#f8fafc",
                    borderRadius:
                      10,
                  }}
                >
                  <strong>
                    Original Payment:
                  </strong>{" "}
                  ₹
                  {Number(
                    payment?.amount ||
                      0
                  ).toFixed(2)}
                </div>

                <label
                  style={{
                    display:
                      "block",
                    marginTop:
                      22,
                    fontWeight:
                      700,
                  }}
                >
                  Deduction / Retained
                  Amount
                </label>

                <input
                  type="number"
                  min="0"
                  value={
                    refundAdjustment
                  }
                  onChange={(
                    e
                  ) =>
                    setRefundAdjustment(
                      Math.max(
                        0,
                        Number(
                          e.target
                            .value
                        )
                      )
                    )
                  }
                  style={{
                    width:
                      "100%",
                    boxSizing:
                      "border-box",
                    marginTop:
                      8,
                    padding:
                      13,
                    borderRadius:
                      8,
                    border:
                      "1px solid #cbd5e1",
                  }}
                />

                <label
                  style={{
                    display:
                      "block",
                    marginTop:
                      20,
                    fontWeight:
                      700,
                  }}
                >
                  Refund Reason
                </label>

                <input
                  value={
                    refundReason
                  }
                  onChange={(
                    e
                  ) =>
                    setRefundReason(
                      e.target
                        .value
                    )
                  }
                  placeholder="Example: Early departure"
                  style={{
                    width:
                      "100%",
                    boxSizing:
                      "border-box",
                    marginTop:
                      8,
                    padding:
                      13,
                    borderRadius:
                      8,
                    border:
                      "1px solid #cbd5e1",
                  }}
                />

                <label
                  style={{
                    display:
                      "block",
                    marginTop:
                      20,
                    fontWeight:
                      700,
                  }}
                >
                  Remarks
                </label>

                <textarea
                  value={
                    refundRemarks
                  }
                  onChange={(
                    e
                  ) =>
                    setRefundRemarks(
                      e.target
                        .value
                    )
                  }
                  rows={3}
                  style={{
                    width:
                      "100%",
                    boxSizing:
                      "border-box",
                    marginTop:
                      8,
                    padding:
                      13,
                    borderRadius:
                      8,
                    border:
                      "1px solid #cbd5e1",
                  }}
                />

                <button
                  onClick={
                    calculateRefund
                  }
                  disabled={
                    loading ||
                    !payment
                  }
                  style={{
                    marginTop:
                      20,
                    padding:
                      "13px 24px",
                    border:
                      "none",
                    borderRadius:
                      8,
                    background:
                      loading ||
                      !payment
                        ? "#94a3b8"
                        : "#92400e",
                    color:
                      "#fff",
                    fontWeight:
                      800,
                    cursor:
                      loading ||
                      !payment
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {loading
                    ? "CALCULATING..."
                    : "CALCULATE REFUND"}
                </button>
              </div>
            )}

          {/* ------------------------------------------------ */}
          {/* REFUND MEMO */}
          {/* ------------------------------------------------ */}

          {checkoutType ===
            "PRE_CHECKOUT" &&
            preCheckoutStep ===
              "REFUND_MEMO" &&
            refund && (
              <RefundMemo
                officerName={userName}
                bookingId={selectedGuest?.booking_id}
                bookingReference={selectedGuest?.booking_reference}
                guestId={selectedGuest?.guest_id}
                guestName={selectedGuest?.guest_name || ""}
                bookingPersonName={
                  selectedGuest?.booking_person_name ||
                  selectedGuest?.guest_name ||
                  ""
                }
                bookingPersonAddress={
                  selectedGuest?.booking_person_address || ""
                }
                guestType={
                  selectedGuest?.guest_type || "UNKNOWN"
                }
                accommodations={
                  selectedGuest
                    ? [
                        {
                          roomId: selectedGuest.room_id,
                          roomName: selectedGuest.room_number,
                          bedId: selectedGuest.bed_id || undefined,
                          bedNumber:
                            selectedGuest.bed_number || undefined,
                        },
                      ]
                    : []
                }
                scheduledCheckOutDate={
                  selectedGuest?.expected_check_out_date || ""
                }
                preCheckOutDate={
                  new Date().toISOString().slice(0, 10)
                }
                totalAmount={Number(refund.original_amount)}
                paidAmount={Number(payment?.amount || 0)}
                adjustmentAmount={Number(refund.deduction_amount)}
                refundableAmount={Number(refund.refund_amount)}
                retainedAmount={
                  Number(refund.used_amount || 0) +
                  Number(refund.deduction_amount || 0)
                }
                loading={loading}
                continueLabel="SAVE REFUND MEMO & CONTINUE →"
                nextStageDescription="The refund memo will be saved before continuing to guest feedback and pre-checkout."
                calculationRemarks={
                  refundRemarks.trim() ||
                  refundReason.trim() ||
                  "Pre Check-Out Refund Memo"
                }
                draft={refundMemoDraft}
                onBack={(draft) => {
                  setRefundMemoDraft(draft);
                  setPreCheckoutStep("REFUND_CALCULATION");
                }}
                onContinue={(memo) =>
                  void createRefundMemo(memo)
                }
              />
            )}

          {/* ------------------------------------------------ */}
          {/* FINAL GUEST FEEDBACK */}
          {/* ------------------------------------------------ */}

          {preCheckoutStep === "FEEDBACK" &&
            checkoutFeedbackContext &&
            !completedCheckout && (
              <CheckoutFeedback
                context={checkoutFeedbackContext}
                loading={loading}
                draft={checkoutFeedbackDraft}
                onDraftChange={setCheckoutFeedbackDraft}
                onBack={
                  checkoutType === "SCHEDULED"
                    ? () => {
                        setPreCheckoutStep(null);
                        setCheckoutType(null);
                      }
                    : undefined
                }
                onSubmit={(values) => void saveCheckoutFeedback(values)}
                onSkip={() => void saveCheckoutFeedback()}
              />
            )}

          {/* ------------------------------------------------ */}
          {/* PRE CHECKOUT ACTUAL CHECKOUT */}
          {/* ------------------------------------------------ */}

          {checkoutType &&
            preCheckoutStep === "CHECKOUT" &&
            (checkoutType !== "PRE_CHECKOUT" ||
              refundMemo ||
              preCheckoutRefundChoice === "NO" ||
              selectedGuest.is_final_checkout_group === false) &&
            !completedCheckout && (
              <div
                style={{
                  background:
                    "#fff",
                  borderRadius:
                    18,
                  border:
                    "1px solid #dbe3ec",
                  padding: 28,
                  marginBottom:
                    22,
                }}
              >
                <h2>
                  {checkoutType === "PRE_CHECKOUT"
                    ? "Confirm Pre Check-Out"
                    : "Confirm Scheduled Check-Out"}
                </h2>

                {selectedGuest.is_final_checkout_group === false && (
                  <p style={{ color: "#64748b" }}>
                    This action checks out the selected room/bed group only. The booking-level refund and final bill will be handled after the remaining groups check out.
                  </p>
                )}

                {refundMemo && (
                <div
                  style={{
                    padding:
                      18,
                    background:
                      "#f8fafc",
                    borderRadius:
                      10,
                    marginTop:
                      18,
                  }}
                >
                  <strong>
                    Refund Memo:
                  </strong>{" "}
                  {
                    refundMemo.memo_number
                  }
                  <br />
                  <strong>
                    Refund Amount:
                  </strong>{" "}
                  ₹
                  {Number(
                    refundMemo.amount
                  ).toFixed(2)}
                </div>
                )}

                <label
                  style={{
                    display:
                      "block",
                    marginTop:
                      20,
                    fontWeight:
                      700,
                  }}
                >
                  Check-Out Remarks
                </label>

                <textarea
                  value={
                    remarks
                  }
                  onChange={(
                    e
                  ) =>
                    setRemarks(
                      e.target
                        .value
                    )
                  }
                  rows={3}
                  style={{
                    width:
                      "100%",
                    boxSizing:
                      "border-box",
                    marginTop:
                      8,
                    padding:
                      13,
                    borderRadius:
                      8,
                    border:
                      "1px solid #cbd5e1",
                  }}
                />

                <button
                  onClick={
                    processCheckOut
                  }
                  disabled={
                    loading
                  }
                  style={{
                    marginTop:
                      20,
                    padding:
                      "13px 24px",
                    border:
                      "none",
                    borderRadius:
                      8,
                    background:
                      loading
                        ? "#94a3b8"
                        : "#1f4d36",
                    color:
                      "#fff",
                    fontWeight:
                      800,
                    cursor:
                      loading
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {loading
                    ? "PROCESSING..."
                    : checkoutType === "PRE_CHECKOUT"
                      ? "CONFIRM PRE CHECK-OUT"
                      : "CONFIRM SCHEDULED CHECK-OUT"}
                </button>
              </div>
            )}

          {/* ------------------------------------------------ */}
          {/* COMPLETED CHECKOUT */}
          {/* ------------------------------------------------ */}

          {completedCheckout && (
            <div
              style={{
                background:
                  "#fff",
                borderRadius:
                  18,
                border:
                  "1px solid #bbf7d0",
                padding: 28,
                marginBottom:
                  22,
              }}
            >
              <h2>
                ✓ Check-Out
                Completed
              </h2>

              <p
                style={{
                  color:
                    "#64748b",
                }}
              >
                {checkoutType ===
                "PRE_CHECKOUT"
                  ? "Pre Check-Out"
                  : "Scheduled Check-Out"}{" "}
                completed
                successfully.
              </p>

              {checkoutType ===
                "PRE_CHECKOUT" &&
                refundMemo && (
                  <div
                    style={{
                      marginTop:
                        18,
                      padding:
                        18,
                      background:
                        "#f0fdf4",
                      borderRadius:
                        10,
                    }}
                  >
                    Refund Memo:{" "}
                    <strong>
                      {
                        refundMemo.memo_number
                      }
                    </strong>
                    <br />
                    Refund Amount:
                    ₹
                    {Number(
                      refundMemo.amount
                    ).toFixed(2)}
                  </div>
                )}
            </div>
          )}

          {/* ------------------------------------------------ */}
          {/* SCHEDULED BILL */}
          {/* ------------------------------------------------ */}

          {completedCheckout &&
            !generatedBill && (
              <div
                style={{
                  background:
                    "#fff",
                  borderRadius:
                    18,
                  border:
                    "1px solid #dbe3ec",
                  padding: 28,
                  marginBottom:
                    22,
                }}
              >
                <h2>Final Bill</h2>

                {checkoutType === "PRE_CHECKOUT" && (
                  <p>
                    Early checkout is complete. The final bill is generated
                    using the actual checkout date; the refund memo remains
                    recorded separately.
                  </p>
                )}

                <div
                  style={{
                    display:
                      "grid",
                    gridTemplateColumns:
                      "1fr 1fr",
                    gap: 18,
                    marginTop:
                      20,
                  }}
                >
                  <NumberField
                    label="Additional Retired / ESM Members"
                    value={
                      additionalPersonCount
                    }
                    onChange={
                      setAdditionalPersonCount
                    }
                  />

                  <NumberField
                    label="Other Relations"
                    value={
                      otherRelationCount
                    }
                    onChange={
                      setOtherRelationCount
                    }
                  />
                </div>

                {legacyPricingRequired && (
                  <div
                    style={{
                      marginTop: 20,
                      padding: 18,
                      borderRadius: 10,
                      border: "1px solid #fcd34d",
                      background: "#fffbeb",
                    }}
                  >
                    <strong>
                      Historical rate required
                    </strong>
                    <p>
                      This booking has no saved pricing snapshot. The
                      configured rate-card values are shown for reference;
                      an ADMIN must verify the applicable official tariff
                      and confirm it before generating the bill.
                    </p>
                    {userRole === "ADMIN" ? (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 14,
                        }}
                      >
                        <label>
                          Official daily rate (₹)
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={legacyDailyRate}
                            onChange={(event) => {
                              setLegacyDailyRate(event.target.value);
                              setConfirmLegacyRate(false);
                            }}
                            style={{
                              display: "block",
                              width: "100%",
                              marginTop: 6,
                              padding: 10,
                            }}
                          />
                        </label>
                        <label>
                          Guest type
                          <select
                            value={legacyGuestType}
                            onChange={(event) => {
                              const guestType = event.target.value;
                              setLegacyGuestType(guestType);
                              setConfirmLegacyRate(false);
                              const suggestedRate =
                                legacyRateCardRates[
                                  guestType as keyof LegacyRateCardRates
                                ];
                              setLegacyDailyRate(
                                suggestedRate === null ||
                                suggestedRate === undefined
                                  ? ""
                                  : String(suggestedRate)
                              );
                            }}
                            style={{
                              display: "block",
                              width: "100%",
                              marginTop: 6,
                              padding: 10,
                            }}
                          >
                            <option value="ESM">ESM</option>
                            <option value="SERVING">Serving</option>
                            <option value="CIVILIAN">Civilian</option>
                          </select>
                        </label>
                        <p
                          style={{
                            gridColumn: "1 / -1",
                            margin: 0,
                          }}
                        >
                          Current {legacyGuestType} rate card for this room:{" "}
                          {legacyRateCardRates[
                            legacyGuestType as keyof LegacyRateCardRates
                          ] === null ||
                          legacyRateCardRates[
                            legacyGuestType as keyof LegacyRateCardRates
                          ] === undefined
                            ? "No rate configured"
                            : `₹${Number(
                                legacyRateCardRates[
                                  legacyGuestType as keyof LegacyRateCardRates
                                ]
                              ).toFixed(2)} per day`}
                        </p>
                        <label
                          style={{
                            gridColumn: "1 / -1",
                          }}
                        >
                          Official tariff / authorization basis
                          <textarea
                            value={legacyAuthorizationReason}
                            onChange={(event) => {
                              setLegacyAuthorizationReason(
                                event.target.value
                              );
                              setConfirmLegacyRate(false);
                            }}
                            minLength={15}
                            maxLength={1000}
                            rows={3}
                            style={{
                              display: "block",
                              width: "100%",
                              marginTop: 6,
                              padding: 10,
                              resize: "vertical",
                            }}
                          />
                        </label>
                        <label
                          style={{
                            gridColumn: "1 / -1",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={confirmLegacyRate}
                            onChange={(event) =>
                              setConfirmLegacyRate(event.target.checked)
                            }
                          />
                          I confirm this is the officially authorized
                          historical rate and the information above is
                          accurate.
                        </label>
                      </div>
                    ) : (
                      <p>
                        Only an ADMIN can authorize the historical rate.
                        Please ask an ADMIN to complete bill generation.
                      </p>
                    )}
                  </div>
                )}

                <p
                  role="status"
                  aria-live="polite"
                  style={{
                    marginTop: 18,
                    color: "#475569",
                    fontWeight: 600,
                  }}
                >
                  {loading
                    ? "Generating final bill automatically..."
                    : userRole === "ADMIN"
                      ? "The final bill will generate automatically after the authorized historical rate is confirmed."
                      : "An ADMIN must authorize the historical rate before the final bill can be generated."}
                </p>
              </div>
            )}

          {/* ------------------------------------------------ */}
          {/* BILL DETAILS */}
          {/* ------------------------------------------------ */}

          {generatedBill &&
            showBillSection && (
              <div
                ref={billPreviewRef}
                className="final-bill-preview"
                style={{
                  background:
                    "#fff",
                  borderRadius:
                    18,
                  border:
                    "1px solid #dbe3ec",
                  padding: 30,
                  marginBottom:
                    22,
                }}
              >
                <div className="final-bill-toolbar">
                  <h2>Final Bill Preview</h2>
                  <button
                    onClick={printBill}
                    className="final-bill-print-button"
                  >
                    PRINT / SAVE PDF
                  </button>
                </div>
                {billPdfStatus?.billNumber === generatedBill.bill_number && (
                  <div
                    role={billPdfStatus.error ? "alert" : "status"}
                    aria-live="polite"
                    style={{ marginBottom: 16 }}
                  >
                    {billPdfStatus.saving ? (
                      <span>Automatically saving bill PDF...</span>
                    ) : billPdfStatus.error ? (
                      <>
                        <span>Bill PDF was not saved: {billPdfStatus.error}</span>{" "}
                        <button
                          type="button"
                          onClick={() => void saveBillPdf(generatedBill.bill_number)}
                        >
                          RETRY SAVE
                        </button>
                      </>
                    ) : (
                      <span>Bill PDF saved: {billPdfStatus.filePath}</span>
                    )}
                  </div>
                )}

                <article className="final-bill-printable">
                  <header className="final-bill-header">
                    <div>
                      <div className="final-bill-organization">
                        ESM REST HOUSE
                      </div>
                      <div>Government Rest House</div>
                    </div>
                    <div className="final-bill-title">
                      <h1>FINAL BILL</h1>
                      <div>
                        Bill No:{" "}
                        <strong>{generatedBill.bill_number}</strong>
                      </div>
                      <div>
                        Bill Date:{" "}
                        {formatBillDate(generatedBill.bill_date)}
                      </div>
                    </div>
                  </header>

                  <section className="final-bill-parties">
                    <div>
                      <h2>GUEST DETAILS</h2>
                      <p>
                        <strong>{generatedBill.booking_person_name || generatedBill.guest_name || selectedGuest?.booking_person_name || selectedGuest?.guest_name || "—"}</strong>
                      </p>
                      {generatedBill.booking_guest_names && (
                        <p>Guests: {generatedBill.booking_guest_names}</p>
                      )}
                      <p>Mobile: {generatedBill.mobile_number || selectedGuest?.mobile_number || "—"}</p>
                      <p>Booking Ref: {generatedBill.booking_reference || selectedGuest?.booking_reference || "—"}</p>
                    </div>
                    <div>
                      <h2>STAY DETAILS</h2>
                      <p>
                        Room: <strong>{generatedBill.room_number || selectedGuest?.room_number || "—"}</strong>
                        {generatedBill.bed_number
                          && (generatedBill.accommodation_units ?? 1) === 1
                          ? ` / Bed ${generatedBill.bed_number}`
                          : ""}
                      </p>
                      <p>Category: {generatedBill.category_name || "—"}</p>
                      <p>
                        Stay: {formatBillDate(generatedBill.check_in_date)} –{" "}
                        {formatBillDate(generatedBill.check_out_time)}
                      </p>
                      <p>Billable days: {generatedBill.stay_days ?? "—"}</p>
                    </div>
                  </section>

                  <table className="final-bill-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Calculation</th>
                        <th>Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Accommodation — {generatedBill.accommodation_type || generatedBill.category_name || "Room"}</td>
                        <td>
                          {generatedBill.accommodation_unit_days ??
                            (generatedBill.accommodation_units ?? 1) *
                              (generatedBill.stay_days ?? 0)} unit-day(s), charged
                          at each unit's applicable daily rate
                        </td>
                        <td>{Number(generatedBill.room_charges).toFixed(2)}</td>
                      </tr>
                      {(generatedBill.additional_person_count || 0) > 0 && (
                        <tr>
                          <td>Additional ESM / retired members</td>
                          <td>
                            {generatedBill.additional_person_count} × ₹
                            {Number(generatedBill.additional_person_rate || 0).toFixed(2)}
                          </td>
                          <td>{Number(generatedBill.additional_person_charges || 0).toFixed(2)}</td>
                        </tr>
                      )}
                      {(generatedBill.other_relation_count || 0) > 0 && (
                        <tr>
                          <td>Other relations</td>
                          <td>
                            {generatedBill.other_relation_count} × ₹
                            {Number(generatedBill.other_relation_rate || 0).toFixed(2)}
                          </td>
                          <td>{Number(generatedBill.other_relation_charges || 0).toFixed(2)}</td>
                        </tr>
                      )}
                      <tr>
                        <td>Food charges</td>
                        <td>—</td>
                        <td>{Number(generatedBill.food_charges).toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td>Discount</td>
                        <td>—</td>
                        <td>−{Number(generatedBill.discount_amount).toFixed(2)}</td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan={2}>TOTAL PAYABLE</th>
                        <th>₹{Number(generatedBill.total_amount).toFixed(2)}</th>
                      </tr>
                    </tfoot>
                  </table>

                  <div className="final-bill-payment">
                    Payment status: <strong>{generatedBill.payment_status || "PENDING"}</strong>
                    {generatedBill.payment_method
                      ? ` · Method: ${generatedBill.payment_method}`
                      : ""}
                  </div>

                  {generatedBill.pricing_source ===
                    "ADMIN_AUTHORIZED_LEGACY_RATE" && (
                      <div className="final-bill-legacy-note">
                        Historical rate authorized: ₹
                        {Number(generatedBill.legacy_daily_rate).toFixed(2)} per day.
                        {generatedBill.legacy_authorization_reason && (
                          <> Authorization basis: {generatedBill.legacy_authorization_reason}</>
                        )}
                      </div>
                    )}

                  <footer className="final-bill-signatures">
                    <span>Guest Signature</span>
                    <span>Prepared By</span>
                    <span>Authorized Signature</span>
                  </footer>
                </article>

                <div
                  style={{
                    marginTop:
                      24,
                    padding:
                      20,
                    background:
                      "#f0fdf4",
                    borderRadius:
                      12,
                    fontWeight:
                      700,
                  }}
                >
                  {checkoutType === "PRE_CHECKOUT"
                    ? preCheckoutRefundChoice === "NO"
                      ? "Pre Check-Out → Feedback → Final Bill → WhatsApp Feedback"
                      : "Pre Check-Out → Refund Memo → Feedback → Final Bill → WhatsApp Feedback"
                    : "Scheduled Check-Out → Final Bill → WhatsApp Feedback"}
                </div>

                <FeedbackButtons
                  loading={
                    loading
                  }
                  notification={
                    feedbackNotification
                  }
                  guestName={
                    selectedGuest?.guest_name || ""
                  }
                  mobile={
                    selectedGuest?.mobile_number || ""
                  }
                  bookingReference={
                    selectedGuest?.booking_reference || ""
                  }
                  onOpenWhatsApp={
                    openWhatsAppFeedback
                  }
                  onPending={() =>
                    createWhatsAppFeedback(
                      "PENDING"
                    )
                  }
                  onSent={() =>
                    createWhatsAppFeedback(
                      "SENT"
                    )
                  }
                  onSkipped={() =>
                    createWhatsAppFeedback(
                      "SKIPPED"
                    )
                  }
                />
              </div>
            )}

          {/* ------------------------------------------------ */}
          {/* PRE CHECKOUT WHATSAPP */}
          {/* ------------------------------------------------ */}

          {completedCheckout &&
            checkoutType ===
              "PRE_CHECKOUT" &&
            preCheckoutStep ===
              "WHATSAPP" && (
              <div
                style={{
                  background:
                    "#fff",
                  borderRadius:
                    18,
                  border:
                    "1px solid #bbf7d0",
                  padding: 30,
                }}
              >
                <h2>
                  WhatsApp Feedback
                </h2>

                <div
                  style={{
                    marginTop:
                      20,
                    padding:
                      20,
                    background:
                      "#f0fdf4",
                    borderRadius:
                      12,
                    lineHeight:
                      1.9,
                  }}
                >
                  ✓ Pre Check-Out
                  <br />
                  {preCheckoutRefundChoice === "NO" ? (
                    <>✓ No refund requested<br /></>
                  ) : (
                    <>
                      ✓ Refund Calculation
                      <br />
                      ✓ Refund Memo: {refundMemo?.memo_number}
                      <br />
                      ✓ Refund Amount: ₹
                      {Number(refundMemo?.amount || 0).toFixed(2)}
                      <br />
                    </>
                  )}
                  <br />
                  ✓ Check-Out
                  completed
                </div>

                <FeedbackButtons
                  loading={
                    loading
                  }
                  notification={
                    feedbackNotification
                  }
                  guestName={
                    selectedGuest?.guest_name || ""
                  }
                  mobile={
                    selectedGuest?.mobile_number || ""
                  }
                  bookingReference={
                    selectedGuest?.booking_reference || ""
                  }
                  onOpenWhatsApp={
                    openWhatsAppFeedback
                  }
                  onPending={() =>
                    createWhatsAppFeedback(
                      "PENDING"
                    )
                  }
                  onSent={() =>
                    createWhatsAppFeedback(
                      "SENT"
                    )
                  }
                  onSkipped={() =>
                    createWhatsAppFeedback(
                      "SKIPPED"
                    )
                  }
                />
              </div>
            )}
        </>
      )}
    </div>
  );
};

const formatBillDate = (value?: string) => {
  if (!value) {
    return "—";
  }

  const datePart = value.slice(0, 10);
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
};

// ---------------------------------------------------------
// INFO CARD
// ---------------------------------------------------------

const InfoCard: React.FC<{
  label: string;
  value: string;
}> = ({
  label,
  value,
}) => (
  <div
    style={{
      background:
        "#f8fafc",
      borderRadius:
        10,
      padding: 16,
    }}
  >
    <div
      style={{
        fontSize: 11,
        color:
          "#64748b",
        fontWeight:
          800,
      }}
    >
      {label}
    </div>

    <div
      style={{
        marginTop: 6,
        fontWeight: 700,
      }}
    >
      {value}
    </div>
  </div>
);

// ---------------------------------------------------------
// NUMBER FIELD
// ---------------------------------------------------------

const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (
    value: number
  ) => void;
}> = ({
  label,
  value,
  onChange,
}) => (
  <div>
    <label
      style={{
        display:
          "block",
        fontWeight:
          700,
        marginBottom:
          8,
      }}
    >
      {label}
    </label>

    <input
      type="number"
      min="0"
      value={value}
      onChange={(e) =>
        onChange(
          Math.max(
            0,
            Number(
              e.target.value
            )
          )
        )
      }
      style={{
        width:
          "100%",
        boxSizing:
          "border-box",
        padding: 13,
        borderRadius:
          8,
        border:
          "1px solid #cbd5e1",
      }}
    />
  </div>
);

// ---------------------------------------------------------
// FEEDBACK BUTTONS
// ---------------------------------------------------------

const FeedbackButtons: React.FC<{
  loading: boolean;
  notification:
    | FeedbackNotification
    | null;
  guestName: string;
  mobile: string;
  bookingReference: string;
  onOpenWhatsApp: () => void;
  onPending: () => void;
  onSent: () => void;
  onSkipped: () => void;
}> = ({
  loading,
  notification,
  guestName,
  mobile,
  bookingReference,
  onOpenWhatsApp,
  onPending,
  onSent,
  onSkipped,
}) => (
  <div
    style={{
      marginTop: 24,
      padding: 20,
      background:
        "#f8fafc",
      borderRadius: 12,
    }}
  >
    <h3>
      WhatsApp Feedback
    </h3>

    <p>
      Open WhatsApp with a prefilled message for{" "}
      {guestName || "the guest"} ({mobile || "no mobile number"}).
      After sending it in WhatsApp, select MARK SENT here. Sending is not
      automatic.
      {bookingReference ? ` Booking ${bookingReference}.` : ""}
    </p>

    {notification && (
      <div
        style={{
          marginBottom:
            16,
          color:
            "#047857",
          fontWeight:
            700,
        }}
      >
        Notification Status:{" "}
        {
          notification.notification_status
        }
      </div>
    )}

    <div
      style={{
        display:
          "flex",
        gap: 12,
        flexWrap:
          "wrap",
      }}
    >
      <button
        type="button"
        onClick={onOpenWhatsApp}
        disabled={loading || !mobile}
        style={{
          padding: "11px 18px",
          border: "none",
          borderRadius: 8,
          background: "#15803d",
          color: "#fff",
          fontWeight: 800,
          cursor: mobile ? "pointer" : "not-allowed",
        }}
      >
        OPEN WHATSAPP
      </button>

      <button
        onClick={
          onPending
        }
        disabled={
          loading
        }
        style={{
          padding:
            "11px 18px",
          borderRadius:
            8,
          border:
            "1px solid #cbd5e1",
          background:
            "#fff",
          fontWeight:
            700,
          cursor:
            "pointer",
        }}
      >
        CREATE PENDING
      </button>

      <button
        onClick={
          onSent
        }
        disabled={
          loading
        }
        style={{
          padding:
            "11px 18px",
          border:
            "none",
          borderRadius:
            8,
          background:
            "#1f4d36",
          color:
            "#fff",
          fontWeight:
            800,
          cursor:
            "pointer",
        }}
      >
        MARK SENT
      </button>

      <button
        onClick={
          onSkipped
        }
        disabled={
          loading
        }
        style={{
          padding:
            "11px 18px",
          border:
            "none",
          borderRadius:
            8,
          background:
            "#64748b",
          color:
            "#fff",
          fontWeight:
            800,
          cursor:
            "pointer",
        }}
      >
        SKIP FEEDBACK
      </button>
    </div>
  </div>
);

export default CheckOut;