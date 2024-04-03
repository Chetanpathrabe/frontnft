import React, {useState, useEffect, useContext} from 'react';
import web3Modal, { providers } from 'web3modal';
import { ethers } from "ethers";
import { useRouter } from 'next/router';
import axios from 'axios';



// Internal Import
import { NFTMarketplaceAddress, NFTMarketplaceABI } from './constants';

//---fetching Smart Contract
const fetchContract = (signerOrProvider) => new ethers.Contract(NFTMarketplaceAddress, NFTMarketplaceABI, signerOrProvider);

//---Connecting with Smart Contract
const connectingWithSmartContract = async () => {
    try {
        const web3Modal = new web3Modal();
        const connection = await web3Modal.connect();
        const provider = new ethers.providers.Web3Provider(connection);
        const signer = provider.getSigner();
        const contract = fetchContract(signer);
        return contract;
    } catch (error) {
        console.log("Something went wrong while connecting with contract");
    }
};

export const NFTMarketplaceContext = React.createContext();

export const NFTMarketplaceProvider = ({children}) => {
    const titleData = "Discover, collect, and sell NFTs";

//-----Usestate

    const [currentAccount, setCurrentAccount] = useState("");
    const router = useRouter();

//----Chech if wallet is connected

    const checkIfWalletConnected = async()=> {
        try {
            if(!window.ethereum) return console.log("Install Metamask");

            const accounts = await window.ethereum.request({method: 'eth_requestAccounts'});

            if(accounts.length){
                setCurrentAccount(accounts[0]);
            }else{
                console.log("No account found");
            }
        } catch (error) {
            console.log("Something went wrong while connecting to wallet");
        }
    };

    useEffect(() => {
        checkIfWalletConnected();
    }, []);

    //---Connect wallet function
    const connectWallet = async () => {
        try {
            if(!window.ethereum) return console.log("Install Metamask");

            const accounts = await window.ethereum.request({method: 'eth_requestAccount'});
            setCurrentAccount(accounts[0]);
            //window.location.reload();
        } catch (error) {
            console.log("Error while connecting to wallet");
        }
    };

//---Upload to Pinata Function
const uploadToPinata = async(file) => {    
    if (file) {    
        try {
            const formData = new FormData();
            formData.append("file", file);
            
            const response = await axios({
                method: "post",
                url: "https://api.pinata.cloud/pinning/pinFileToIPFS",
                data: formData,
                headers: {
                    pinata_api_key: `5d289220cb346320b2ce`,

                    pinata_secret_api_key: `e1b62df0b1814820972d922ef487b7e111e136d057fbadf0e16136a68ffe3bd9`,
                    "Content-Type": "multipart/form-data",
                },
            
            });
            
            const ImgHash= `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`
            return ImgHash;
        } catch(error) {
            console.log("Unable to upload image to Pinata");
        }
    }
};

    //----Create NFT Function
    const createNFT = async (name, price, image, description, router)=>{  
            if(!name ||!description ||!price || !image) return setError("Data is Missing"), setOpenError(true);

            const data = JSON.stringify({name, description, image})

            try {
                const response = await axios({
                    method: "post",
                    url: "https://api.pinata.cloud/pinning/pinJSONToIPFS",
                    data: data,
                    headers: {
                        pinata_api_key: `441a7933913945442219`,
                        pinata_secret_api_key: `17ba3527d630d664c4ddca34fa38daa2e5b60495ade104859cf35f96ad6a3d4a`,
                        "Content-Type": "application/json",
                    },
                });

                const url = `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`;
                console.log(url);

                await createSale(url, price);
                router.push("/searchPage");
            } catch (error) {
                setError("Error while creating NFT");
                setOpenError(true);
        }
    };
    
    //---Create Sale Function   27:24 timestamp video 33
    const createSale = async (url, formInputPrice, isReselling, id) =>{
        try {
            const price = ethers.utils.parseUnits(formInputPrice, "ether");
            const contract = await connectingWithSmartContract();

            const listingPrice = await contract.getListingPrice();
            const transaction = !isReselling ? await contract.createToken(url, price, {
                value: listingPrice.toString(),
            })
            : await contract.reSellToken(url, price, {
                value: listingPrice.toString(),
            });

            await transaction.wait();
            router.push("/searchPage");
            console.log(transaction);
        } catch (error) {
            console.log("Error while creating sale");
        }
    };

    //---Fetch NFT Function
    const fetchNFTs = async () => {
        try {
            const provider = new ethers.providers.JsonRpcProvider();
            const contract = fetchContract(provider);

            const data = await contract.fetchMarketItem();
            //console.log(data)
            const items = await Promise.all(
                data.map(async({tokenId, seller, owner, price: unformattedPrice})=>{
                    const tokenURI = await contract.tokenURI(tokenId);

                    const {
                        data: {image, name, description},
                    } = await axios.get(tokenURI);
                    const price = ethers.utils.formatUnits(unformattedPrice.toString(), "ether");

                    return {
                        price,
                        tokenId: tokenId.toNumber(),
                        seller, owner, image, name, description, tokenURI
                    };
                })
            );
            return items;
        } catch (error) {
            console.log("Error while fetching NFTs");
        }
    };

    useEffect(() => {
        fetchNFTs();
    }, []);

    //---Fetching my NFT or Listed NFTs
    const fetchMyNFTsOrListedNFTs = async () => {
        try {
            const contract = await connectingWithSmartContract();
            const data = type == "fetchItemsListed" ? await contract.fetchItemsListed() : 
            await contract.fetchMyNFTs();

            const items = await Promise.all(
                data.map(async({tokenId, seller, owner, price: unformattedPrice})=>{
                    const tokenURI = await contract.tokenURI(tokenId);
                    const {
                        data: {image, name, description},
                    } = await axios.get(tokenURI);
                    const price = ethers.utils.formatUnits(unformattedPrice.toString(), "ether");

                    return {
                        price,
                        tokenId: tokenId.toNumber(),
                        seller, owner, image, name, description, tokenURI
                    };
                })
            );
            return items;
        } catch (error) {
            console.log("Error while fetching my NFTs or listed NFTs");
        }
    }

    //---Buy NFTs Function
    const buyNFTs = async (nft) => {
        try {
            const contract = await connectingWithSmartContract();
            const price = ethers.utils.parseUnits(nft.price.toString(), "ether");

            const transaction = await contract.createMarketSale(nft.tokenId, {
                value: price,
            });

            await transaction.wait();
        } catch (error) {
            console.log("Error while buying NFTs");
            
        }
    }

    return (
        <NFTMarketplaceContext.Provider value={{ checkIfWalletConnected, connectWallet, uploadToPinata, createNFT, fetchNFTs, fetchMyNFTsOrListedNFTs, buyNFTs, currentAccount, titleData }}> 
            {children}
        </NFTMarketplaceContext.Provider>
    );
};

