import React, { useEffect, useState } from "react";
import API_URLS from "../../config";
import TransactionModal from "../TransactionModal";
import NFTMessageBox from "../NFTMessageBox";
import LoadingOverlayForCard from "../LoadingOverlayForCard";
import { Check, X } from "lucide-react";
import { useTransactionHandler } from "../../hooks/useTransactionHandler";
import nft_pic from "../../assets/nft.png";

const OfferReceivedCard = ({
  sellOffers,
  buyOffer,
  index,
  onAction,
  myWalletAddress,
  myDisplayName,
  refreshSellOffers,
  updateUsersNFTs,
  widgetApi,
}) => {
  const [madeOffers, setMadeOffers] = useState([]);
  const [roomMessage, setRommMessage] = useState("");
  const [sendRoomMsg, setSendRoomMsg] = useState(false);

  // Use transaction handler hook
  const {
    isLoading,
    isQrModalVisible,
    qrCodeUrl,
    transactionStatus,
    isMessageBoxVisible,
    messageBoxType,
    messageBoxText,
    setIsLoading,
    setIsMessageBoxVisible,
    executeTransaction,
    showMessage,
    closeQrModal,
  } = useTransactionHandler({
    myWalletAddress,
    onTransactionComplete: () => {
      setSendRoomMsg(true);
      onAction?.();
    },
  });

  useEffect(() => {
    console.log(
      "OfferReceivedCard->sendRoomMsg useEffect triggered",
      sendRoomMsg,
      roomMessage
    );

    if (sendRoomMsg && roomMessage !== "") {
      console.log("sendRoomMsg", sendRoomMsg);
      widgetApi.sendRoomEvent("m.room.message", {
        body: roomMessage,
      });
    }
  }, [sendRoomMsg]);

  useEffect(() => {
    setMadeOffers(sellOffers);
    console.log("OfferReceivedCard->sellOffer-->", sellOffers);
  }, [sellOffers]);

  async function onAcceptOffer() {
    console.log("Accept clicked for item:", buyOffer);
    console.log("SellOffer--->", madeOffers);

    // Path 1: Accept incoming sell offer (requires QR)
    if (buyOffer.offer.isSell === true) {
      const requestBody = {
        address: myWalletAddress,
        OfferId: buyOffer.offer.offerId,
        buyOrSell: 0,
      };
      console.log(requestBody, "requestBody");

      await executeTransaction({
        endpoint: "/accept-offer",
        payload: requestBody,
        offerType: "accept_sell_offer",
        successMessage: "Sell offer accepted successfully!",
        errorMessage: "Error accepting sell offer. Please try again.",
        insufficientCreditMessage: "You don't have enough mCredits to accept this offer.\nPlease buy more mCredits.",
      });
      return;
    }

    // Path 2 & 3: Accept buy offer (either with existing sell offer or create new one)
    else {
      setIsLoading(true);

      let isOfferFound = false;
      let sellOfferIndex = "";
      let brokerFee = (((buyOffer.offer.amount * 1 - 12) / 1.01) * 0.01).toFixed(0);
      let sellOfferOwner = "";

      // Check if matching sell offer exists
      for (const offer of madeOffers) {
        console.log("offer--->", offer);
        if (offer.nft.nftokenID === buyOffer.nft.nftokenID) {
          isOfferFound = true;
          sellOfferIndex = offer.offer.offerId;
          brokerFee = (((buyOffer.offer.amount * 1 - 12) / 1.01) * 0.01).toFixed(0);
          sellOfferOwner = offer.offer.offerOwner;
          console.log("brokerFee--->", brokerFee, buyOffer.offer.amount, offer.offer.amount);
          break;
        }
      }

      // Path 2: Matching sell offer found - use broker (direct success check, no QR)
      if (isOfferFound) {
        const requestBody = {
          owner: myWalletAddress,
          nftId: buyOffer.nft.nftokenID,
          buyOfferId: buyOffer.offer.offerId,
          sellOfferId: sellOfferIndex,
          brokerFee: brokerFee,
        };
        console.log("requestBody--->", requestBody);

        let strAmount = "";
        let strCurrency = "";
        if (typeof buyOffer.offer.amount === "string") {
          strAmount = ((buyOffer.offer.amount * 1 - 12) / 1000000).toString();
          strCurrency = "XRP";
        } else {
          strAmount = buyOffer.offer.amount.amount;
          strCurrency = buyOffer.offer.amount.currency;
        }

        const msg = `🔔NFT Accept Offer Created\n${buyOffer.offer.offerOwnerName} purchased ${buyOffer.nft.metadata.name} from ${myDisplayName} for ${strAmount} ${strCurrency}`;
        console.log("msg-->", msg);
        setRommMessage(msg);
        setSendRoomMsg(false);

        try {
          const response = await fetch(`${API_URLS.backendUrl}/broker-accept-offer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          setIsLoading(false);

          if (data?.result === "NotEnoughCredit") {
            showMessage("error", "You don't have enough mCredits to accept this offer.\nPlease buy more mCredits.");
            return;
          }

          if (data.result?.meta?.TransactionResult === "tesSUCCESS") {
            showMessage("success", "Offer finished successfully");
            setSendRoomMsg(true);
            updateUsersNFTs(buyOffer.nft.nftokenID, sellOfferOwner, buyOffer.offer.offerOwner);
            onAction?.();
          } else {
            showMessage("error", data.result?.meta?.TransactionResult || "Transaction failed");
          }
        } catch (error) {
          setIsLoading(false);
          console.error("Error during fetch:", error);
          showMessage("error", "Error accepting offer. Please try again.");
        }
      }
      // Path 3: No matching sell offer - auto-create one first (requires QR)
      else {
        console.log("No matching offer found - auto-creating sell offer");
        let sellAmount = ((buyOffer.offer.amount * 1 - 12) / 1000000).toString();

        const payload = {
          nft: buyOffer.nft.nftokenID,
          amount: sellAmount,
          receiver: "all",
          sender: myWalletAddress,
        };
        console.log("payload for sell", payload);

        // This will trigger QR flow, then onTransactionComplete will handle the broker acceptance
        await executeTransaction({
          endpoint: "/create-nft-offer",
          payload,
          offerType: "auto_create_sell_offer",
          successMessage: "Sell offer created. Now accepting buy offer...",
          errorMessage: "Error creating sell offer. Please try again.",
          insufficientCreditMessage: "You don't have enough mCredits to create this offer.\nPlease buy more mCredits.",
        });

        // After successful QR completion, need to call broker-accept-offer
        // This will be handled by refreshSellOfferAndAccept which is triggered elsewhere
      }
    }
  }

  async function onCancelOffer() {
    console.log("Cancel clicked for item:", buyOffer);

    // Path 1: Received buy offer - direct cancel (no QR)
    if (buyOffer?.offer?.isSell !== true) {
      setIsLoading(true);

      const requestBody = {
        owner: myWalletAddress,
        offerId: buyOffer.offer.offerId,
      };
      console.log(requestBody, "requestBody");

      try {
        const response = await fetch(`${API_URLS.backendUrl}/cancel-nft-offer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        setIsLoading(false);

        if (data?.result === "NotEnoughCredit") {
          showMessage("error", "You don't have enough mCredits to cancel this offer.\nPlease buy more mCredits.");
          return;
        }

        showMessage("success", "Offer cancelled successfully");
        onAction?.();
      } catch (error) {
        setIsLoading(false);
        console.error("Error during fetch:", error);
        showMessage("error", "Error cancelling offer. Please try again.");
      }
    }
    // Path 2: Received sell offer - cancel with signature (requires QR)
    else {
      const requestBody = {
        owner: myWalletAddress,
        account: buyOffer.offer.offerOwner,
        offerId: buyOffer.offer.offerId,
      };
      console.log(requestBody, "requestBody");

      await executeTransaction({
        endpoint: "/cancel-nft-offer-with-sign",
        payload: requestBody,
        offerType: "cancel_sell_offer",
        successMessage: "Offer cancelled successfully!",
        errorMessage: "Error cancelling offer. Please try again.",
        insufficientCreditMessage: "You don't have enough mCredits to cancel this offer.\nPlease buy more mCredits.",
      });
    }
  }

  async function onAcceptAutoMakeSellOfferOffer(refreshedSellOffers) {
    console.log("onAcceptAutoMakeSellOfferOffer item:", buyOffer);
    console.log("SellOffer--->", refreshedSellOffers);

    let isOfferFound = false;
    let sellOfferIndex = "";
    let brokerFee = (parseFloat(buyOffer.amount) * 1.01).toString();
    let sellOfferOwner = "";

    for (const offer of refreshedSellOffers) {
      console.log("offer--->", offer);
      if (offer.NFTokenID === buyOffer.nft.nftokenID) {
        isOfferFound = true;
        sellOfferIndex = offer.nft_offer_index;
        sellOfferOwner = offer.owner;
        brokerFee = (((buyOffer.offer.amount * 1 - 12) / 1.01) * 0.01).toFixed(0);
        break;
      }
    }

    if (isOfferFound) {
      const requestBody = {
        owner: myWalletAddress,
        nftId: buyOffer.nft.nftokenID,
        buyOfferId: buyOffer.offer.offerId,
        sellOfferId: sellOfferIndex,
        brokerFee: brokerFee,
      };
      console.log("requestBody--->", requestBody);

      let strAmount = "";
      let strCurrency = "";
      if (typeof buyOffer.offer.amount === "string") {
        strAmount = ((buyOffer.offer.amount * 1 - 12) / 1000000).toString();
        strCurrency = "XRP";
      } else {
        strAmount = buyOffer.offer.amount.amount;
        strCurrency = buyOffer.offer.amount.currency;
      }
      const msg = `🔔NFT Accept Offer Created\n${buyOffer.offer.offerOwnerName} purchased ${buyOffer.nft.metadata.name} from ${myDisplayName} for ${strAmount} ${strCurrency}`;
      console.log("msg-->", msg);
      setRommMessage(msg);
      setSendRoomMsg(false);

      try {
        const response = await fetch(`${API_URLS.backendUrl}/broker-accept-offer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data?.result === "NotEnoughCredit") {
          showMessage("error", "You don't have enough mCredits to accept this offer.\nPlease buy more mCredits.");
          return;
        }

        if (data.result?.meta?.TransactionResult === "tesSUCCESS") {
          showMessage("success", "Offer finished successfully");
          setSendRoomMsg(true);
          updateUsersNFTs(buyOffer.nft.nftokenID, sellOfferOwner, buyOffer.offer.offerOwner);
          onAction?.();
        } else {
          showMessage("error", data.result?.meta?.TransactionResult || "Transaction failed");
        }
      } catch (error) {
        console.error("Error during fetch:", error);
        showMessage("error", "Error accepting offer. Please try again.");
      }
    }
    setIsLoading(false);
  }

  async function refreshSellOfferAndAccept() {
    console.log("refreshSellOfferAndAccept");
    const refreshedSellOffers = await refreshSellOffers();
    console.log("done refreshSellOffers", refreshedSellOffers);
    onAcceptAutoMakeSellOfferOffer(refreshedSellOffers);
  }

  function handleCloseMessageBox() {
    setIsMessageBoxVisible(false);
    // onAction();
  }

  return (
    <>
      {isLoading ? (
        <LoadingOverlayForCard />
      ) : (
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-xl transition-all duration-300">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <img
              src={buyOffer.nft.imageURI || nft_pic}
              alt={`NFT`}
              className="w-full md:w-40 h-auto rounded-xl object-cover shadow-lg border border-gray-200/50 dark:border-gray-700/50"
            />

            <div className="flex-1 space-y-3 text-center md:text-left">
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                NFT Name:{" "}
                <span className="text-sm font-mono break-all">
                  {buyOffer.nft.metadata.name ? buyOffer.nft.metadata.name : ""}
                </span>
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                {buyOffer?.offer?.isSell === true ? (
                  <span> Seller's Name:{" "}</span>
                ) : (
                  <span> Buyer's Name:{" "}</span>
                )}
                <span className="font-mono break-all">
                  {buyOffer.offer.offerOwnerName}
                </span>
              </p>
              <p className="text-lg font-medium text-blue-600 dark:text-blue-400">
                Amount:{" "}
                {((buyOffer.offer.amount * 1 - 12) / 1000000).toFixed(6)}
              </p>
              <p className="text-sm px-3 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 w-fit mx-auto md:mx-0 border border-yellow-200 dark:border-yellow-800">
                Received Offer
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={onAcceptOffer}
                className="px-5 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                {buyOffer?.offer?.isSell === true ? (
                  <span> Buy</span>
                ) : (
                  <span> Accept</span>
                )}

              </button>
              <button
                onClick={onCancelOffer}
                className="px-5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                Reject
              </button>
            </div>
          </div>
          <TransactionModal
            isOpen={isQrModalVisible}
            onClose={() => setIsQrModalVisible(false)}
            qrCodeUrl={qrCodeUrl}
            transactionStatus={transactionStatus}
          />
          <NFTMessageBox
            isOpen={isMessageBoxVisible}
            onClose={handleCloseMessageBox}
            type={messageBoxType}
            message={messageBoxText}
          />
        </div>
        /*
        <div className="flex flex-col sm:flex-row items-center bg-white dark:bg-[#1a1d21] p-5 rounded-2xl shadow-xl w-full max-w-3xl border border-gray-200 dark:border-gray-700 gap-1 transition-all duration-300">
          <div className="w-full sm:w-auto flex justify-center">
            <img
              src={buyOffer.nft.imageURI}
              alt="NFT Preview"
              className="w-32 h-32 sm:w-40 sm:h-40 rounded-xl object-cover shadow-md border border-gray-300 dark:border-gray-600"
            />
          </div>
   
          <div className="flex flex-col text-center sm:text-left gap-1 flex-grow">
            <span className="font-semibold text-gray-900 dark:text-white text-lg sm:text-xl truncate">
              {buyOffer.nft.name}
            </span>
          </div>
   
          <div className="flex flex-col sm:items-end text-center sm:text-right w-full sm:w-auto gap-1">
            <div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                Amount:{" "}
                {((buyOffer.offer.amount * 1 - 12) / 1.01 / 1000000).toFixed(6)}
              </span>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                From {buyOffer.offer.offerOwnerName}
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Received Offer
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between w-full sm:w-auto space-y-4 sm:space-y-0 sm:space-x-4">
              <Button
                type="primary"
                onClick={onAcceptOffer}
                block
                style={{ borderRadius: "6px", alignItems: "center" }}
                className="dark:bg-green-600 dark:hover:bg-green-500"
                // className="w-full sm:w-auto bg-red-500 text-white px-4 sm:px-5 py-2 rounded-lg hover:bg-red-600 transition shadow-md text-center">
              >
                Accept
              </Button>
              <Button
                type="primary"
                onClick={onCancelOffer}
                block
                style={{ borderRadius: "6px", alignItems: "center" }}
                className="dark:bg-red-600 dark:hover:bg-red-500"
                // className="w-full sm:w-auto bg-red-500 text-white px-4 sm:px-5 py-2 rounded-lg hover:bg-red-600 transition shadow-md text-center">
              >
                Reject
              </Button>
            </div>
          </div>
          </div>
          */
      )}
    </>
  );
};

export default OfferReceivedCard;
