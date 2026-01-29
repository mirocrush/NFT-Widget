import React from "react";
import TransactionModal from "../TransactionModal";
import NFTMessageBox from "../NFTMessageBox";
import LoadingOverlayForCard from "../LoadingOverlayForCard";
import { X } from "lucide-react";
import { useTransactionHandler } from "../../hooks/useTransactionHandler";
import nft_pic from "../../assets/nft.png";

const OutgoingOfferCard = ({ transfer, index, onAction, myWalletAddress }) => {
  // Use transaction handler hook
  const {
    isLoading,
    isQrModalVisible,
    qrCodeUrl,
    transactionStatus,
    isMessageBoxVisible,
    messageBoxType,
    messageBoxText,
    setIsMessageBoxVisible,
    executeTransaction,
    closeQrModal,
  } = useTransactionHandler({
    myWalletAddress,
    onTransactionComplete: onAction,
  });


  async function onRejectTransfer() {
    console.log("onRejectTransfer for item:", transfer);

    const requestBody = {
      owner: myWalletAddress,
      offerId: transfer.offer.offerId,
    };
    console.log("requestBody:", requestBody);
 
    await executeTransaction({
      endpoint: "/cancel-nft-offer-with-sign",
      payload: requestBody,
      offerType: "cancel_transfer_offer",
      successMessage: "Transfer cancelled successfully!",
      errorMessage: "Error cancelling transfer. Please try again.",
      insufficientCreditMessage: "You don't have enough mCredits to cancel this offer.\nPlease buy more mCredits.",
    });
  }

  return (
    <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-xl transition-all duration-300">
      {isLoading && (
        <div className="absolute inset-0 z-10">
          <LoadingOverlayForCard />
        </div>
      )}
      <div className="flex flex-col md:flex-row items-center gap-6">
        <img
          src={transfer.nft.imageURI || nft_pic}
          alt={`NFT`}
          className="w-full md:w-40 h-auto rounded-xl object-cover shadow-lg border border-gray-200/50 dark:border-gray-700/50"
        />

        <div className="flex-1 space-y-3 text-center md:text-left">
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            NFT Name:{" "}
            <span className="text-sm font-mono break-all">
              {transfer.nft.metadata.name ? transfer.nft.metadata.name : ""}
            </span>
          </p>
          <p className="text-sm px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 w-fit mx-auto md:mx-0 border border-purple-200 dark:border-purple-800">
            Outgoing Transfer
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onRejectTransfer}
            disabled={isLoading}
            className="px-5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
            Cancel
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
    // <motion.div
    //   initial={{ opacity: 0, y: 10 }}
    //   animate={{ opacity: 1, y: 0 }}
    //   className="flex flex-col sm:flex-row items-center sm:justify-between bg-white dark:bg-[#15191E] p-4 rounded-xl shadow-md w-full max-w-2xl border border-gray-200 dark:border-gray-700 space-y-4 sm:space-y-0 sm:space-x-4 transition-colors"
    // >
    //   <div className="flex items-center gap-3 w-full sm:w-auto overflow-hidden">
    //     <img
    //       src={transfer.nft.imageURI}
    //       alt="TextRP Feature Pack"
    //       className="w-16 h-16 rounded-lg object-cover shadow-sm"
    //     />
    //     <div className="flex flex-col text-center sm:text-left overflow-hidden">
    //       <span className="font-semibold text-gray-900 dark:text-white text-base sm:text-lg truncate w-full">
    //         {transfer.nft.name}
    //       </span>
    //       {/* <span className="text-gray-500 dark:text-gray-400 text-sm sm:text-base truncate w-full">Exclusive NFT Collection TextRP Feature Pack TextRP Feature Pack TextRP Feature Pack</span> */}
    //     </div>
    //   </div>
    //   <div className="flex flex-col items-center sm:items-end text-center sm:text-right w-full sm:w-auto">
    //     <span className="text-gray-500 dark:text-gray-400 text-sm sm:text-base sm:whitespace-nowrap">
    //       Outgoing Transfer Offer
    //     </span>
    //   </div>
    //   <div className="flex flex-col sm:flex-row items-center justify-between w-full sm:w-auto space-y-4 sm:space-y-0 sm:space-x-4">
    //     <Button
    //       type="primary"
    //       onClick={onRejectTransfer}
    //       block
    //       style={{ borderRadius: "6px", alignItems: "center" }}
    //       className="dark:bg-green-600 dark:hover:bg-green-500"
    //       // className="w-full sm:w-auto bg-red-500 text-white px-4 sm:px-5 py-2 rounded-lg hover:bg-red-600 transition shadow-md text-center">
    //     >
    //       Cancel
    //     </Button>
    //   </div>
    //   <TransactionModal
    //     isOpen={isQrModalVisible}
    //     onClose={() => setIsQrModalVisible(false)}
    //     qrCodeUrl={qrCodeUrl}
    //     transactionStatus={transactionStatus}
    //   />
    // </motion.div>
  );
};

export default OutgoingOfferCard;
