import React, { useState } from "react";
import API_URLS from "../../config";
import TransactionModal from "../TransactionModal";
import LoadingOverlayForCard from "../LoadingOverlayForCard";
import NFTMessageBox from "../NFTMessageBox";
import { DollarSign, User, X } from "lucide-react";
import { useTransactionHandler } from "../../hooks/useTransactionHandler";
import nft_pic from "../../assets/nft.png";

const OfferMadeCard = ({ sellOffer, index, onAction, myWalletAddress }) => {
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
    onTransactionComplete: onAction,
  });

  async function onCancelOffer() {
    console.log("Cancel clicked for item:", sellOffer);
    console.log("Cancel offer request:", sellOffer, 'brokerWalletAddress:', API_URLS.brokerWalletAddress);

    try {
      // Path 1: Non-broker destination - use QR flow
      if (sellOffer.offer.destination !== API_URLS.brokerWalletAddress) {
        const requestBody = {
          owner: myWalletAddress,
          account: sellOffer.offer.offerOwner,
          offerId: sellOffer.offer.offerId,
        };
        console.log(requestBody, "requestBody");

        await executeTransaction({
          endpoint: "/cancel-nft-offer-with-sign",
          payload: requestBody,
          offerType: "cancel_offer",
          successMessage: "Offer cancelled successfully!",
          errorMessage: "Error cancelling offer. Please try again.",
          insufficientCreditMessage: "You don't have enough mCredits to cancel this offer.\nPlease buy more mCredits.",
        });
      }
      // Path 2: Broker destination - direct cancellation
      else {
        setIsLoading(true);
        const requestBody = {
          owner: myWalletAddress,
          offerId: sellOffer.offer.offerId,
        };
        console.log(requestBody, "requestBody");

        const response = await fetch(`${API_URLS.backendUrl}/cancel-nft-offer`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log(data, "data received from server");
        setIsLoading(false);

        if (data?.result === "NotEnoughCredit") {
          showMessage("error", "You don't have enough mCredits to cancel this offer.\nPlease buy more mCredits.");
          return;
        }

        if (data.result?.meta?.TransactionResult === "tesSUCCESS") {
          console.log(data, "returned data");
          showMessage("success", "Offer cancelled successfully.");
          onAction();
        } else {
          console.log("Transaction failed:", data.result?.meta?.TransactionResult);
          showMessage("error", `Failed to cancel the offer.\nPlease try again.\nError: ${data.result?.meta?.TransactionResult || "Unknown"}`);
        }
      }
    } catch (error) {
      setIsLoading(false);
      console.error("Error during fetch:", error);
      showMessage("error", "Error cancelling offer. Please try again.");
    }
  }

  return (
    <>
      {isLoading ? (
        <LoadingOverlayForCard />
      ) : (
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-xl transition-all duration-300">
          <div className="flex flex-col lg:flex-row items-start gap-6">
            {/* NFT Image */}
            <div className="relative flex-shrink-0">
              <img
                src={sellOffer.nft.imageURI || nft_pic}
                alt={`NFT`}
                className="w-48 h-48 rounded-2xl object-cover shadow-lg border border-gray-200/50 dark:border-gray-700/50"
              />
              <div className="absolute -top-2 -right-2">
                <div className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${sellOffer.offer.isSell
                  ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800'
                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                  }`}>
                  <span className="w-2 h-2 bg-current rounded-full mr-1.5 inline-block"></span>
                  {sellOffer.offer.isSell ? "Sell Offer" : "Buy Offer"}
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {sellOffer.nft.metadata?.name || "Unnamed NFT"}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 font-mono break-all">
                  ID: {sellOffer.nft.nftokenID}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center shadow-md">
                    <DollarSign className="text-white w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Offer Amount</p>
                    <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                      {(sellOffer.offer.amount * 1) / 1000000} XRP
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-md">
                    <User className="text-white w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Offer Owner</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {sellOffer.offer.offerOwnerName || "Unknown"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3 w-full lg:w-auto">
              <button
                onClick={onCancelOffer}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-200 shadow-md hover:shadow-lg"
              >
                <X className="w-4 h-4" />
                <span>Cancel Offer</span>
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
            onClose={() => setIsMessageBoxVisible(false)}
            type={messageBoxType}
            message={messageBoxText}
          />
        </div>
      )}
    </>
  );
};

export default OfferMadeCard;
