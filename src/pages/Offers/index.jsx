import React, { useEffect, useState, useMemo } from "react";
import OutgoingTransferToggle from "../../components/OutgoingTransferToggle";
import IncomingTransferToggle from "../../components/IncomingTransferToggle";
import OfferMadeToggle from "../../components/OfferMadeToggle";
import OfferReceivedToggle from "../../components/OfferReceivedToggle";
import API_URLS from "../../config";
import LoadingOverlay from "../../components/LoadingOverlay";
import { Briefcase, RefreshCcw, Package } from "lucide-react";
import { getAllNFTOffers } from "../../services/xrplService";

const Offers = ({
  membersList,
  myDisplayName,
  myWalletAddress,
  myNftData,
  widgetApi,
  isRefreshing,
  updateUsersNFTs,
  incomingOffer,
  cancelledOffer,
}) => {
  const [receivedOffers, setReceivedOffers] = useState([]);
  const [madeOffers, setMadeOffers] = useState([]);
  const [incomingTransferOffers, setIncomingTransferOffers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sellOffers, setSellOffers] = useState([]);
  const [usersOffer, setUsersOffer] = useState([]);
  // to avoid runtime error in fetchReceivedBuyOffers
  const [nftBuyOffers, setNftBuyOffers] = useState([]);

  // ---------- Address -> Name resolver ----------
  const addressToName = useMemo(() => {
    console.log("memberList", membersList);
    const map = new Map();

    // From membersList
    membersList?.forEach((m) => {
      const addr =
        m.userId?.split(":")[0]?.replace("@", "");
      const name = m.name ;
      if (addr) map.set(addr, name);
    });

    // From myNftData
    myNftData?.forEach((member) => {
      const addr =
        member.walletAddress?.trim() ||
        member.wallet?.trim() ||
        member.address?.trim() ||
        member.userId?.split(":")[0]?.replace("@", "");
      const name =
        member.displayName ||
        member.userName ||
        member.matrixDisplayName ||
        member.userId;
      if (addr && !map.has(addr)) map.set(addr, name);
    });

    // Broker + me
    const broker = API_URLS.brokerWalletAddress?.trim();
    if (broker && !map.has(broker)) map.set(broker, "Broker");
    if (myWalletAddress) map.set(myWalletAddress, myDisplayName || "You");

    console.log("Address to Name map:", map);

    return map;
  }, [membersList, myNftData, myWalletAddress, myDisplayName]);

  const shortAddr = (a) =>
    a && a.length >= 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "";
  const resolveName = (addr) => addressToName.get(addr) || shortAddr(addr) || "Unknown";

  // Helper function to safely check if amount is a transfer (0)
  const isTransferAmount = (amount) => {
    if (amount === "0" || amount === 0) return true;
    if (amount === null || amount === undefined || amount === '') return true;
    try {
      return parseFloat(String(amount)) === 0;
    } catch {
      return false;
    }
  };

  // Validate offer structure
  const isValidOffer = (offer) => {
    return offer && 
           typeof offer === 'object' &&
           (offer.OfferID || offer.offerIndex || offer.index) &&
           (offer.NFTokenID || offer.nftokenID) &&
           (offer.Owner || offer.account || offer.owner);
  };

  useEffect(() => {
    console.log("Offers->useEffect->incoming offer", incomingOffer);
    if (incomingOffer) {
      console.log("incomingOffer", incomingOffer);

      const walletNftMap = {};
      const nftMapById = new Map();
      myNftData.forEach((member) => {
        member.groupedNfts.forEach((group) => {
          group.nfts.forEach((nft) => {
            nftMapById.set(nft.nftokenID, { ...nft });
          });
        });
        const wallet = member.walletAddress;
        const nftIds = member.groupedNfts.flatMap((group) =>
          group.nfts.map((nft) => nft.nftokenID)
        );
        walletNftMap[wallet] = new Set(nftIds);
      });

      console.log(
        "incomingOffer detail--->",
        !incomingOffer.offer.isSell,
        walletNftMap[myWalletAddress]?.has(incomingOffer.nft.nftokenID),
        incomingOffer.offer.destination,
        myWalletAddress
      );

      if (
        (!incomingOffer.offer.isSell &&
          walletNftMap[myWalletAddress]?.has(incomingOffer.nft.nftokenID)) ||
        incomingOffer.offer.destination === myWalletAddress
      ) {
        console.log("incomingOffer accepted-----");

        // attach offerOwnerName before pushing into state
        const ownerAddr =
          incomingOffer.offer.offerOwner ||
          incomingOffer.offer.account ||
          incomingOffer.offer.owner;
        const withName = {
          ...incomingOffer,
          offer: {
            ...incomingOffer.offer,
            offerOwnerName: resolveName(ownerAddr),
          },
        };

        setReceivedOffers((prev) => [...prev, withName]);
      }
    }
  }, [incomingOffer, myNftData, myWalletAddress]);

  useEffect(() => {
    if (cancelledOffer?.length > 0) {
      console.log("Offers->useEffect->cancelled offer", cancelledOffer);

      const cancelledIds = new Set(cancelledOffer);

      setMadeOffers((prev) =>
        prev.filter((offer) => !cancelledIds.has(offer.offer.offerId))
      );
      setReceivedOffers((prev) =>
        prev.filter((offer) => !cancelledIds.has(offer.offer.offerId))
      );
    }
  }, [cancelledOffer]);

  useEffect(() => {
    console.log("Offers->useEffect->isRefreshing", isRefreshing);
    if (isRefreshing !== undefined && isRefreshing !== 0) {
      refreshOffers();
    }
  }, [isRefreshing]);

  useEffect(() => {
    console.log("Offers->useEffect", membersList, myWalletAddress);
    if (myWalletAddress === "" || membersList.length < 1) return;
    refreshOffers();
  }, [membersList, myWalletAddress]);

  async function fetchReceivedBuyOffers() {
    const requestOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: myWalletAddress }),
    };

    console.log("Fetching NFT buy offers...", requestOptions);

    try {
      const response = await fetch(
        `${API_URLS.backendUrl}/getUserNftsWithBuyOffers`,
        requestOptions
      );
      const data = await response.json();
      console.log("getUserNftsWithBuyOffers ---->", data);

      const memberData = myNftData.find(
        (u) => u.userId.split(":")[0].replace("@", "") === myWalletAddress
      );

      const nftMap = {};
      if (memberData?.groupedNfts?.length) {
        for (const group of memberData.groupedNfts) {
          for (const nft of group.nfts) {
            nftMap[nft.nftokenID] = { ...nft };
          }
        }
      }

      const filteredOffers = data.flatMap((item) =>
        item.NftBuyOffers.map((offer) => {
          const nftMeta = nftMap[item.NFTokenID];
          return {
            ...offer,
            URI: item.URI,
            NFTokenID: item.NFTokenID,
            offerOwnerName: resolveName(offer.Account || offer.account),
            ...(nftMeta && {
              imageURI: nftMeta.imageURI,
              name: nftMeta.metadata?.name,
            }),
          };
        })
      );

      setNftBuyOffers(filteredOffers);
      console.log(filteredOffers, "nft buy offers");
    } catch (error) {
      console.error("Error fetching NFT buy offers:", error);
    } finally {
      console.log("fetchReceivedBuyOffers is finished");
    }
  }

  async function fetchSellOffers() {
    const requestOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: myWalletAddress }),
    };
    console.log("Fetching NFT sell offers...", requestOptions);
    try {
      const response = await fetch(
        `${API_URLS.backendUrl}/getMembersNftsWithSellOffers`,
        requestOptions
      );
      const data = await response.json();

      const memberData = myNftData.find(
        (u) => u.userId.split(":")[0].replace("@", "") === myWalletAddress
      );

      const nftMap = {};
      if (memberData?.groupedNfts?.length) {
        for (const group of memberData.groupedNfts) {
          for (const nft of group.nfts) {
            nftMap[nft.nftokenID] = { ...nft };
          }
        }
      }

      const filteredOffers = data.flatMap((item) =>
        item.NftBuyOffers.map((offer) => {
          const nftMeta = nftMap[item.NFTokenID];
          return {
            ...offer,
            URI: item.URI,
            NFTokenID: item.NFTokenID,
            offerOwnerName: resolveName(offer.Account || offer.account),
            ...(nftMeta && {
              imageURI: nftMeta.imageURI,
              name: nftMeta.metadata?.name,
              nft: nftMeta,
            }),
          };
        })
      );

      return filteredOffers;
    } catch (error) {
      console.error("Error fetching NFT sell offers:", error);
    } finally {
      console.log("fetchSellOffer is finished");
    }
  }

  const fetchIncomingTransferOffers = async (currentAddress) => {
    const tempAddress = currentAddress.split(":")[0].replace("@", "");

    // Skip if the address is own wallet
    if (tempAddress === myWalletAddress) return [];

    try {
      const requestOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: tempAddress }),
      };

      const response = await fetch(
        `${API_URLS.backendUrl}/getMembersNftsWithSellOffers`,
        requestOptions
      );
      const data = await response.json();
      const memberData = myNftData.find((u) => u.userId === currentAddress);

      const nftMap = {};
      if (memberData?.groupedNfts?.length) {
        for (const group of memberData.groupedNfts) {
          for (const nft of group.nfts) {
            nftMap[nft.nftokenID] = {
              ...nft,
            };
          }
        }
      }

      const filteredOffers = data.flatMap((item) =>
        item.NftBuyOffers.filter(
          (offer) => offer.destination === myWalletAddress
        ).map((offer) => {
          const nftMeta = nftMap[item.NFTokenID];
          return {
            ...offer,
            URI: item.URI,
            NFTokenID: item.NFTokenID,
            offerOwnerName: resolveName(offer.Account || offer.account),
            ...(nftMeta && {
              imageURI: nftMeta.imageURI,
              name: nftMeta.metadata?.name,
            }),
          };
        })
      );
      return filteredOffers;
    } catch (error) {
      console.error(`Error fetching data for ${tempAddress}:`, error);
      return [];
    }
  };

  const fetchAllUsersOfers = async () => {
    try {
      console.log("🔍 Fetching NFT offers from xrpldata for:", myWalletAddress);

      const data = await getAllNFTOffers(myWalletAddress);
      console.log("✅ NFT offers data from xrpldata:", data);
      console.log("📊 Offer Summary:", {
        userCreated: data.summary?.totalUserCreated || 0,
        counterOffers: data.summary?.totalCounterOffers || 0,
        destinationOffers: data.summary?.totalDestinationOffers || 0,
        total: data.summary?.totalOffers || 0
      });

      // Validate data structure
      if (!data || typeof data !== 'object') {
        console.error("❌ Invalid data structure from getAllNFTOffers");
        setMadeOffers([]);
        setReceivedOffers([]);
        return;
      }

      const brokerWalletAddress = API_URLS.brokerWalletAddress?.trim();
      console.log("🏦 Broker wallet address:", brokerWalletAddress);

      const isRelevantOffer = (offer) => {
        // Validate offer first
        if (!offer || !isValidOffer(offer)) {
          console.log("⚠️ Invalid offer structure, skipping:", offer);
          return false;
        }

        // xrpldata.com uses capitalized field names
        const destination = offer.Destination || offer.destination;
        const amount = offer.Amount || offer.amount;
        const account = offer.Owner || offer.account || offer.owner;

        // Check if it's a transfer (no payment required)
        if (!destination || isTransferAmount(amount)) {
          console.log("✅ Direct transfer offer:", offer.offerIndex, { amount, destination });
          return true;
        }
        
        // Check if broker is involved
        if (
          brokerWalletAddress &&
          (destination === brokerWalletAddress ||
            account === brokerWalletAddress)
        ) {
          console.log("✅ Broker-involved offer:", offer.offerIndex);
          return true;
        }
        
        // Check if it's for me
        if (
          destination === myWalletAddress ||
          account === myWalletAddress
        ) {
          console.log("✅ Direct offer (no broker):", offer.offerIndex);
          return true;
        }
        
        console.log(
          "❌ Filtered out brokered offer by another marketplace:",
          offer.offerIndex,
          {
            destination: destination,
            account: account,
            amount: amount,
          }
        );
        return false;
      };

      const nftMapById = new Map();
      const walletNftMap = {};

      // Build NFT maps with null safety
      if (Array.isArray(myNftData)) {
        myNftData.forEach((member) => {
          if (!member || typeof member !== 'object') return;
          
          if (Array.isArray(member.groupedNfts)) {
            member.groupedNfts.forEach((group) => {
              if (!group || !Array.isArray(group.nfts)) return;
              
              group.nfts.forEach((nft) => {
                // Use both variants of NFT ID (lowercase from old format, uppercase from xrpldata)
                const nftId = nft.nftokenID || nft.NFTokenID;
                if (nftId) {
                  // Store under both formats for compatibility
                  nftMapById.set(nftId, { ...nft });
                  if (nft.nftokenID && nft.NFTokenID && nft.nftokenID !== nft.NFTokenID) {
                    nftMapById.set(nft.NFTokenID, { ...nft });
                  }
                }
              });
            });
          }
          
          const wallet = member.walletAddress?.trim();
          if (wallet) {
            const nftIds = member.groupedNfts?.flatMap((group) => {
              if (!group || !Array.isArray(group.nfts)) return [];
              return group.nfts.map((nft) => nft.nftokenID || nft.NFTokenID).filter(Boolean);
            }) || [];
            walletNftMap[wallet] = new Set(nftIds);
          }
        });
      }

      console.log("📋 Wallet NFT Map:", walletNftMap);
      console.log("📋 My wallet NFTs count:", walletNftMap[myWalletAddress]?.size || 0);

      const madeOffers_ = [];
      const receivedOffers_ = [];

      // User-created (made) offers - with null safety
      if (data?.userCreatedOffers && Array.isArray(data.userCreatedOffers) && data.userCreatedOffers.length > 0) {
        console.log(
          `📤 Processing ${data.userCreatedOffers.length} user created offers...`
        );

        data.userCreatedOffers
          .filter(isRelevantOffer)
          .forEach((offer) => {
            const nftId = offer.NFTokenID || offer.nftokenID;
            const nftData =
              offer.nftoken || nftMapById.get(nftId);
            const ownerAccount = offer.Owner || offer.account;
            madeOffers_.push({
              offer: {
                offerId: offer.OfferID || offer.offerIndex,
                amount: offer.Amount || offer.amount,
                offerOwner: ownerAccount,
                offerOwnerName: resolveName(ownerAccount),
                nftId: nftId,
                isSell: typeof offer.Flags === 'number' ? (offer.Flags & 1) === 1 : (offer.flags?.sellToken || false),
                destination: offer.Destination || offer.destination,
                valid: offer.valid,
                validationErrors: offer.validationErrors,
                createdAt: offer.createdAt,
                expiration: offer.Expiration || offer.expiration,
              },
              nft: nftData
                ? {
                    ...nftData,
                    nftokenID: nftId,
                    metadata: nftData.metadata || offer.nftoken?.metadata,
                    imageURI:
                      nftData?.imageURI || 
                      nftData?.assets?.preview || 
                      nftData?.assets?.image ||
                      offer.nftoken?.imageURI ||
                      offer.nftoken?.assets?.preview ||
                      offer.nftoken?.metadata?.image,
                    name:
                      nftData.name || 
                      nftData.metadata?.name ||
                      offer.nftoken?.name ||
                      offer.nftoken?.metadata?.name,
                  }
                : null,
            });
          });
      }

      // Counter offers (on NFTs you own) - BUY OFFERS from others on your NFTs
      if (data?.counterOffers && Array.isArray(data.counterOffers) && data.counterOffers.length > 0) {
        console.log(
          `📥 Processing ${data.counterOffers.length} counter offers...`
        );

        data.counterOffers
          .filter(isRelevantOffer)
          .forEach((offer) => {
            const nftId = offer.NFTokenID || offer.nftokenID;
            const ownerAccount = offer.Owner || offer.account;
            console.log("🔍 Checking counter offer:", {
              offerIndex: offer.OfferID || offer.offerIndex,
              nftokenID: nftId,
              account: ownerAccount,
              amount: offer.Amount || offer.amount,
              flags: offer.Flags || offer.flags,
              hasNFT: walletNftMap[myWalletAddress]?.has(nftId)
            });

            const nftData =
              offer.nftoken || nftMapById.get(nftId);

            if (walletNftMap[myWalletAddress]?.has(nftId)) {
              console.log("✅ Counter offer is on my NFT, adding to receivedOffers");
              receivedOffers_.push({
                offer: {
                  offerId: offer.OfferID || offer.offerIndex,
                  amount: offer.Amount || offer.amount,
                  offerOwner: ownerAccount,
                  offerOwnerName: resolveName(ownerAccount),
                  nftId: nftId,
                  isSell: typeof offer.Flags === 'number' ? (offer.Flags & 1) === 1 : (offer.flags?.sellToken || false),
                  destination: offer.Destination || offer.destination,
                  valid: offer.valid,
                  validationErrors: offer.validationErrors,
                  createdAt: offer.createdAt,
                  expiration: offer.Expiration || offer.expiration,
                },
                nft: nftData
                  ? {
                      ...nftData,
                      nftokenID: nftId,
                      metadata:
                        nftData.metadata || offer.nftoken?.metadata,
                      imageURI:
                        nftData?.imageURI || 
                        nftData?.assets?.preview ||
                        nftData?.assets?.image ||
                        offer.nftoken?.imageURI ||
                        offer.nftoken?.assets?.preview ||
                        offer.nftoken?.metadata?.image,
                      name:
                        nftData.name || 
                        nftData.metadata?.name ||
                        offer.nftoken?.name ||
                        offer.nftoken?.metadata?.name,
                    }
                  : null,
              });
            } else {
              console.log("❌ Counter offer NOT on my NFT, skipping");
            }
          });
      }

      // Private offers (destination = you)
      if (data?.privateOffers && Array.isArray(data.privateOffers) && data.privateOffers.length > 0) {
        console.log(
          `🔒 Processing ${data.privateOffers.length} destination offers (where you are destination)...`
        );

        // Count transfer offers (Amount = 0)
        const transferCount = data.privateOffers.filter(offer => 
          isTransferAmount(offer.Amount || offer.amount)
        ).length;
        console.log(`   📨 ${transferCount} transfer offers (Amount=0)`);
        console.log(`   💰 ${data.privateOffers.length - transferCount} paid offers`);

        data.privateOffers
          .filter(isRelevantOffer)
          .forEach((offer) => {
            const nftId = offer.NFTokenID || offer.nftokenID;
            const ownerAccount = offer.Owner || offer.account;
            const destination = offer.Destination || offer.destination;
            const amount = offer.Amount || offer.amount;
            const nftData =
              offer.nftoken || nftMapById.get(nftId);

            // All offers from this endpoint should have destination = myWalletAddress
            // But we double-check for safety
            if (destination === myWalletAddress) {
              console.log(`✅ Adding destination offer to receivedOffers:`, {
                offerId: offer.OfferID || offer.offerIndex,
                amount: amount,
                isTransfer: isTransferAmount(amount),
                from: ownerAccount
              });
              
              receivedOffers_.push({
                offer: {
                  offerId: offer.OfferID || offer.offerIndex,
                  amount: offer.Amount || offer.amount,
                  offerOwner: ownerAccount,
                  offerOwnerName: resolveName(ownerAccount),
                  nftId: nftId,
                  isSell: typeof offer.Flags === 'number' ? (offer.Flags & 1) === 1 : (offer.flags?.sellToken || false),
                  destination: destination,
                  valid: offer.valid,
                  validationErrors: offer.validationErrors,
                  createdAt: offer.createdAt,
                  expiration: offer.Expiration || offer.expiration,
                },
                nft: nftData
                  ? {
                      ...nftData,
                      nftokenID: nftId,
                      metadata:
                        nftData.metadata || offer.nftoken?.metadata,
                      imageURI:
                        nftData?.imageURI || 
                        nftData?.assets?.preview ||
                        nftData?.assets?.image ||
                        offer.nftoken?.imageURI ||
                        offer.nftoken?.assets?.preview ||
                        offer.nftoken?.metadata?.image,
                      name:
                        nftData.name || 
                        nftData.metadata?.name ||
                        offer.nftoken?.name ||
                        offer.nftoken?.metadata?.name,
                    }
                  : null,
              });
            }
          });
      }

      console.log("📤 Made offers (after filtering):", madeOffers_);
      console.log("📥 Received offers (after filtering):", receivedOffers_);
      console.log("📊 Summary:", {
        ...data.summary,
        madeOffersDisplayed: madeOffers_.length,
        receivedOffersDisplayed: receivedOffers_.length,
        transferOffers: receivedOffers_.filter(o => isTransferAmount(o.offer.amount)).length
      });

      setMadeOffers(madeOffers_);
      setReceivedOffers(receivedOffers_);
    } catch (error) {
      console.error("❌ Error fetching NFT offers:", error);
      // Set empty arrays on error to prevent UI from showing stale data
      setMadeOffers([]);
      setReceivedOffers([]);
      
      // Show user-friendly error message
      if (error.message?.includes('402') || error.message?.includes('Payment')) {
        console.error("⚠️ Payment claim insufficient - unable to fetch offers. Please check your Dhali account.");
      }
    }
  };

  const refreshOffers = async () => {
    console.log("Offers->refreshOffers", myWalletAddress);
    if (!myWalletAddress) {
      console.warn("⚠️ No wallet address available for refreshing offers");
      return;
    }

    setLoading(true);

    try {
      console.log("🔄 Starting to refresh NFT offers...");
      await fetchAllUsersOfers();
      console.log("✅ NFT offers refresh completed");
    } catch (error) {
      console.error("❌ Error refreshing offers:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full bg-gradient-to-br from-white/80 to-blue-50/80 dark:from-gray-900/80 dark:to-gray-800/80 backdrop-blur-sm">
      {loading ? (
        <LoadingOverlay message="Loading..." />
      ) : (
        <div className="h-full overflow-y-auto custom-scrollbar px-3 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-md">
                <span className="text-white text-lg">
                  <Briefcase />
                </span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Trade Offers
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 max-w-[75%]">
                  Manage your NFT trading offers and transfers
                </p>
              </div>
            </div>

            <button
              onClick={refreshOffers}
              className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-700 justify-center dark:text-gray-200 w-10 h-10 rounded-xl font-semibold flex items-center gap-2 shadow-md hover:shadow-lg transition-all duration-200 border border-gray-200/50 dark:border-gray-700/50"
            >
              <span className="text-xs">
                <RefreshCcw />
              </span>
            </button>
          </div>

          {/* Offers Grid */}
          <div className="grid gap-6">
            {/* Incoming Transfers */}
            <div className="animate-fade-in">
              <IncomingTransferToggle
                title="Incoming Transfers"
                incomingTransfers={receivedOffers}
                onAction={refreshOffers}
                myOwnWalletAddress={myWalletAddress}
                updateUsersNFTs={updateUsersNFTs}
                widgetApi={widgetApi}
                myDisplayName={myDisplayName}
              />
            </div>

            {/* Outgoing Transfers */}
            <div className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
              <OutgoingTransferToggle
                title="Outgoing Transfers"
                outgoingTransfers={madeOffers}
                onAction={refreshOffers}
                myOwnWalletAddress={myWalletAddress}
              />
            </div>

            {/* Offers Received */}
            <div className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
              <OfferReceivedToggle
                title="Offers Received"
                madeOffers={madeOffers}
                receivedOffers={receivedOffers}
                myDisplayName={myDisplayName}
                myOwnWalletAddress={myWalletAddress}
                onAction={refreshOffers}
                refreshSellOffers={fetchSellOffers}
                widgetApi={widgetApi}
                updateUsersNFTs={updateUsersNFTs}
              />
            </div>

            {/* Offers Made */}
            <div className="animate-fade-in" style={{ animationDelay: "0.3s" }}>
              <OfferMadeToggle
                title="Offers Made"
                madeOffers={madeOffers}
                myOwnWalletAddress={myWalletAddress}
                onAction={refreshOffers}
              />
            </div>
          </div>

          {/* Empty State */}
          {receivedOffers.length === 0 && madeOffers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-24 h-24 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded-full flex items-center justify-center shadow-lg">
                <Package className="text-gray-400 w-12 h-12" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  No Offers Yet
                </h3>
                <p className="text-gray-600 dark:text-gray-400 max-w-md">
                  You don&apos;t have any active offers or transfers. Start
                  trading NFTs to see them here!
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Offers;
